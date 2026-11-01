import http.client
import json
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "agent"))

import app  # noqa: E402


def text_response(text: str) -> dict:
    return {
        "output": {"message": {"role": "assistant", "content": [{"text": text}]}},
        "usage": {"inputTokens": 10, "outputTokens": 5, "totalTokens": 15},
    }


def tool_response(name: str, arguments: dict, tool_id: str = "tool-1") -> dict:
    return {
        "output": {
            "message": {
                "role": "assistant",
                "content": [
                    {
                        "toolUse": {
                            "toolUseId": tool_id,
                            "name": name,
                            "input": arguments,
                        }
                    }
                ],
            }
        },
        "usage": {"inputTokens": 12, "outputTokens": 3, "totalTokens": 15},
    }


class FakeModel:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0
        self.max_tokens_seen = []

    def converse(self, messages, system_prompt, max_tokens):
        self.calls += 1
        self.max_tokens_seen.append(max_tokens)
        if not self.responses:
            return tool_response("get_cluster_status", {}, f"loop-{self.calls}")
        return self.responses.pop(0)


class FakeTools:
    def __init__(self, error=False):
        self.calls = []
        self.error = error

    def invoke(self, name, arguments):
        self.calls.append((name, arguments))
        if self.error:
            raise app.ToolFailure("simulated tool failure")
        return {"tool": name, "ok": True, "arguments": arguments}


class AgentTests(unittest.TestCase):
    def test_tool_then_text_is_bounded_and_accounted(self):
        model = FakeModel([tool_response("get_cluster_status", {}), text_response("all clear")])
        tools = FakeTools()
        agent = app.Agent(model, tools, app.Limits(max_output_tokens=128))
        result = agent.respond("What is the cluster state?")
        self.assertEqual(result["response"], "all clear")
        self.assertEqual(result["tool_calls"], 1)
        self.assertEqual(result["model_calls"], 2)
        self.assertEqual(result["tool_trace"], [{"name": "get_cluster_status", "status": "success"}])
        self.assertEqual(result["usage"]["totalTokens"], 30)
        self.assertEqual(model.max_tokens_seen, [128, 128])

    def test_disabled_agent_rejects_new_invocations(self):
        agent = app.Agent(FakeModel([]), FakeTools(), enabled=False)
        with self.assertRaises(app.Disabled):
            agent.respond("hello")

    def test_empty_or_oversized_prompt_is_rejected(self):
        agent = app.Agent(FakeModel([]), FakeTools(), app.Limits(max_prompt_chars=10))
        with self.assertRaises(app.InvalidRequest):
            agent.respond("")
        with self.assertRaises(app.InvalidRequest):
            agent.respond("x" * 11)

    def test_turn_limit_stops_a_tool_loop(self):
        model = FakeModel([])
        agent = app.Agent(model, FakeTools(), app.Limits(max_turns=2, max_model_calls=2))
        with self.assertRaises(app.LimitExceeded):
            agent.respond("loop")
        self.assertEqual(model.calls, 2)

    def test_tool_call_limit_is_enforced(self):
        response = {
            "output": {
                "message": {
                    "role": "assistant",
                    "content": [
                        {"toolUse": {"toolUseId": "a", "name": "query_incidents", "input": {}}},
                        {"toolUse": {"toolUseId": "b", "name": "read_s3_doc", "input": {"key": "x"}}},
                    ],
                }
            },
            "usage": {},
        }
        agent = app.Agent(
            FakeModel([response]),
            FakeTools(),
            app.Limits(max_tool_calls=1, max_model_calls=1, max_turns=1),
        )
        with self.assertRaises(app.LimitExceeded):
            agent.respond("two tools")

    def test_tool_failure_is_returned_as_an_error_result(self):
        model = FakeModel([tool_response("query_incidents", {}), text_response("tool failed")])
        tools = FakeTools(error=True)
        agent = app.Agent(model, tools)
        result = agent.respond("query")
        self.assertEqual(result["response"], "tool failed")
        self.assertEqual(result["tool_trace"], [{"name": "query_incidents", "status": "error"}])

    def test_runtime_limit_is_enforced(self):
        ticks = iter([0.0, 0.0, 2.0, 2.0, 2.0])
        agent = app.Agent(
            FakeModel([tool_response("get_cluster_status", {})]),
            FakeTools(),
            app.Limits(max_runtime_seconds=1),
            clock=lambda: next(ticks),
        )
        with self.assertRaises(app.LimitExceeded):
            agent.respond("slow")

    def test_model_returning_no_content_is_an_error(self):
        agent = app.Agent(FakeModel([{"output": {"message": {"content": []}}, "usage": {}}]), FakeTools())
        with self.assertRaises(app.AgentError):
            agent.respond("empty")

    def start_server(self, agent):
        server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.make_handler(agent, threading.BoundedSemaphore(1)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, thread

    def test_http_ping_and_invocation_contract(self):
        agent = app.Agent(FakeModel([text_response("healthy")]), FakeTools())
        server, thread = self.start_server(agent)
        try:
            conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
            conn.request("GET", "/ping")
            ping = conn.getresponse()
            self.assertEqual(ping.status, 200)
            self.assertEqual(json.loads(ping.read())["status"], "Healthy")

            conn.request(
                "POST",
                "/invocations",
                body=json.dumps({"prompt": "status?"}),
                headers={"Content-Type": "application/json"},
            )
            invoke = conn.getresponse()
            body = json.loads(invoke.read())
            self.assertEqual(invoke.status, 200)
            self.assertEqual(body["response"], "healthy")
            conn.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_http_disabled_agent_rejects_new_work(self):
        agent = app.Agent(FakeModel([]), FakeTools(), enabled=False)
        server, thread = self.start_server(agent)
        try:
            conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
            conn.request("GET", "/ping")
            ping = conn.getresponse()
            self.assertEqual(ping.status, 200)
            self.assertFalse(json.loads(ping.read())["agent_enabled"])

            conn.request(
                "POST",
                "/invocations",
                body=json.dumps({"prompt": "hello"}),
                headers={"Content-Type": "application/json"},
            )
            invoke = conn.getresponse()
            self.assertEqual(invoke.status, 503)
            conn.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
