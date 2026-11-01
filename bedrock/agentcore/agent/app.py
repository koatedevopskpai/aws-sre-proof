"""Minimal AgentCore Runtime HTTP agent.

This is a read-only synthetic operations assistant. The model may propose tool
calls; the allow-listed tools are read-only. There is no commit, approval or
infrastructure-mutation path in this container.

Runtime contract:
  - listen on 0.0.0.0:8080
  - POST /invocations with JSON {"prompt": "..."}
  - GET /ping -> {"status": "Healthy"}

The container is ARM64; see ../Dockerfile.
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

MAX_BODY_BYTES = 64 * 1024

SYSTEM_PROMPT = (
    "You are a read-only synthetic operations assistant for a reliability lab. "
    "Use only the provided tools. Never claim to change infrastructure or money. "
    "If the available evidence is insufficient, say so instead of inventing facts."
)

TOOL_SPECS: list[dict[str, Any]] = [
    {
        "toolSpec": {
            "name": "query_incidents",
            "description": "Query synthetic incidents. Read-only.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string", "enum": ["P1", "P2", "P3"]},
                        "limit": {"type": "integer", "minimum": 1, "maximum": 20},
                    },
                    "additionalProperties": False,
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "read_s3_doc",
            "description": "Read an approved synthetic document by key. Read-only.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {"key": {"type": "string", "maxLength": 200}},
                    "required": ["key"],
                    "additionalProperties": False,
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "get_cluster_status",
            "description": "Return the synthetic mock cluster status. Read-only.",
            "inputSchema": {
                "json": {"type": "object", "properties": {}, "additionalProperties": False}
            },
        }
    },
]


class AgentError(Exception):
    status = 500


class InvalidRequest(AgentError):
    status = 400


class Disabled(AgentError):
    status = 503


class Busy(AgentError):
    status = 429


class LimitExceeded(AgentError):
    status = 422


class ToolFailure(AgentError):
    status = 502


@dataclass(frozen=True)
class Limits:
    max_turns: int = 4
    max_tool_calls: int = 6
    max_model_calls: int = 4
    max_prompt_chars: int = 4000
    max_output_tokens: int = 512
    max_runtime_seconds: int = 60
    max_concurrency: int = 2

    @classmethod
    def from_env(cls) -> "Limits":
        def integer(name: str, default: int, minimum: int, maximum: int) -> int:
            raw = os.environ.get(name, str(default))
            try:
                value = int(raw)
            except ValueError as exc:
                raise ValueError(f"{name} must be an integer") from exc
            if not minimum <= value <= maximum:
                raise ValueError(f"{name} must be between {minimum} and {maximum}")
            return value

        return cls(
            max_turns=integer("AGENT_MAX_TURNS", 4, 1, 10),
            max_tool_calls=integer("AGENT_MAX_TOOL_CALLS", 6, 0, 20),
            max_model_calls=integer("AGENT_MAX_MODEL_CALLS", 4, 1, 10),
            max_prompt_chars=integer("AGENT_MAX_PROMPT_CHARS", 4000, 1, 20000),
            max_output_tokens=integer("AGENT_MAX_OUTPUT_TOKENS", 512, 1, 4096),
            max_runtime_seconds=integer("AGENT_MAX_RUNTIME_SECONDS", 60, 1, 900),
            max_concurrency=integer("AGENT_MAX_CONCURRENCY", 2, 1, 16),
        )


class BedrockModel:
    """Thin Converse client. boto3 is imported lazily so local tests need no AWS."""

    def __init__(self, region: str, model_id: str):
        import boto3

        self.client = boto3.client("bedrock-runtime", region_name=region)
        self.model_id = model_id

    def converse(
        self,
        messages: list[dict[str, Any]],
        system_prompt: str,
        max_tokens: int,
    ) -> dict[str, Any]:
        return self.client.converse(
            modelId=self.model_id,
            messages=messages,
            system=[{"text": system_prompt}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.0},
            toolConfig={"tools": TOOL_SPECS},
        )


class LambdaTools:
    """Allow-listed read-only tool client.

    The model can never supply a Lambda ARN or an arbitrary function name.
    """

    def __init__(self, region: str, functions: dict[str, str]):
        import boto3

        self.client = boto3.client("lambda", region_name=region)
        self.functions = functions

    def invoke(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        function_name = self.functions.get(name)
        if not function_name:
            raise ToolFailure(f"tool {name!r} is not allow-listed")
        response = self.client.invoke(
            FunctionName=function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps(arguments, separators=(",", ":")).encode("utf-8"),
        )
        if response.get("FunctionError"):
            raise ToolFailure(f"tool {name!r} returned an error")
        payload = response.get("Payload")
        raw = payload.read() if payload is not None else b""
        if not raw:
            return {}
        parsed = json.loads(raw.decode("utf-8"))
        if not isinstance(parsed, dict):
            raise ToolFailure(f"tool {name!r} returned a non-object")
        return parsed


class Agent:
    def __init__(
        self,
        model: Any,
        tools: Any,
        limits: Limits | None = None,
        enabled: bool = True,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.model = model
        self.tools = tools
        self.limits = limits or Limits()
        self.enabled = enabled
        self.clock = clock

    def _check_time(self, started: float) -> None:
        if self.clock() - started > self.limits.max_runtime_seconds:
            raise LimitExceeded("runtime limit exceeded")

    def respond(self, prompt: Any, run_id: str | None = None) -> dict[str, Any]:
        if not self.enabled:
            raise Disabled("new invocations are disabled")
        if not isinstance(prompt, str) or not prompt.strip():
            raise InvalidRequest("prompt must be a non-empty string")
        if len(prompt) > self.limits.max_prompt_chars:
            raise InvalidRequest("prompt exceeds the configured character limit")

        run_id = run_id or str(uuid.uuid4())
        started = self.clock()
        messages: list[dict[str, Any]] = [
            {"role": "user", "content": [{"text": prompt}]}
        ]
        usage = {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0}
        tool_trace: list[dict[str, Any]] = []
        model_calls = 0
        tool_calls = 0
        turns = 0

        for turn in range(1, self.limits.max_turns + 1):
            turns = turn
            self._check_time(started)
            if model_calls >= self.limits.max_model_calls:
                raise LimitExceeded("model-call limit exceeded")

            response = self.model.converse(
                messages=messages,
                system_prompt=SYSTEM_PROMPT,
                max_tokens=self.limits.max_output_tokens,
            )
            model_calls += 1

            for key in usage:
                value = (response.get("usage") or {}).get(key, 0)
                if isinstance(value, int):
                    usage[key] += value

            output = (response.get("output") or {}).get("message") or {}
            content = output.get("content") or []
            if not isinstance(content, list) or not content:
                raise AgentError("model returned no content")
            messages.append({"role": "assistant", "content": content})

            tool_uses = [
                block["toolUse"] for block in content if isinstance(block, dict) and "toolUse" in block
            ]
            text = "".join(
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and isinstance(block.get("text"), str)
            )

            if not tool_uses:
                return {
                    "run_id": run_id,
                    "response": text.strip(),
                    "status": "success",
                    "turns": turns,
                    "model_calls": model_calls,
                    "tool_calls": tool_calls,
                    "tool_trace": tool_trace,
                    "usage": usage,
                    "elapsed_ms": int((self.clock() - started) * 1000),
                }

            for tool_use in tool_uses:
                if tool_calls >= self.limits.max_tool_calls:
                    raise LimitExceeded("tool-call limit exceeded")
                tool_calls += 1
                self._check_time(started)
                name = tool_use.get("name", "")
                arguments = tool_use.get("input") or {}
                tool_use_id = tool_use.get("toolUseId", "")
                try:
                    if not isinstance(arguments, dict):
                        raise ToolFailure("tool arguments must be an object")
                    result = self.tools.invoke(name, arguments)
                    status = "success"
                    trace_status = "success"
                except Exception as exc:  # bounded error, not a crash
                    result = {"error": str(exc)[:200]}
                    status = "error"
                    trace_status = "error"
                tool_trace.append({"name": name, "status": trace_status})
                messages.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "toolResult": {
                                    "toolUseId": tool_use_id,
                                    "content": [{"json": result}],
                                    "status": status,
                                }
                            }
                        ],
                    }
                )

        raise LimitExceeded("turn limit exceeded")


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def make_handler(agent: Agent, semaphore: threading.BoundedSemaphore):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
            return

        def do_GET(self) -> None:  # noqa: N802
            if self.path.split("?", 1)[0] == "/ping":
                _json_response(
                    self,
                    200,
                    {"status": "Healthy", "agent_enabled": bool(agent.enabled)},
                )
                return
            _json_response(self, 404, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path.split("?", 1)[0] != "/invocations":
                _json_response(self, 404, {"error": "not found"})
                return
            if not agent.enabled:
                _json_response(self, 503, {"error": "new invocations are disabled"})
                return
            if not semaphore.acquire(blocking=False):
                _json_response(self, 429, {"error": "concurrency limit exceeded"})
                return
            try:
                raw_length = self.headers.get("Content-Length")
                try:
                    length = int(raw_length or "0")
                except ValueError:
                    _json_response(self, 400, {"error": "invalid content length"})
                    return
                if length <= 0 or length > MAX_BODY_BYTES:
                    _json_response(self, 400, {"error": "invalid body size"})
                    return
                try:
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    _json_response(self, 400, {"error": "body must be JSON"})
                    return
                if not isinstance(body, dict):
                    _json_response(self, 400, {"error": "body must be a JSON object"})
                    return
                result = agent.respond(body.get("prompt"), run_id=body.get("run_id"))
                _json_response(self, 200, result)
            except AgentError as exc:
                _json_response(self, exc.status, {"error": str(exc)})
            except Exception:
                _json_response(self, 500, {"error": "internal error"})
            finally:
                semaphore.release()

    return Handler


def main() -> None:
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
    model_id = os.environ.get("MODEL_ID", "us.amazon.nova-2-lite-v1:0")
    enabled = os.environ.get("AGENT_ENABLED", "true").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    limits = Limits.from_env()

    functions = {
        "query_incidents": os.environ.get("QUERY_INCIDENTS_FUNCTION", ""),
        "read_s3_doc": os.environ.get("READ_S3_DOC_FUNCTION", ""),
        "get_cluster_status": os.environ.get("GET_CLUSTER_STATUS_FUNCTION", ""),
    }
    missing = [name for name, value in functions.items() if not value]
    if enabled and missing:
        raise SystemExit(f"missing tool function configuration: {', '.join(missing)}")

    agent = Agent(
        model=BedrockModel(region, model_id),
        tools=LambdaTools(region, functions),
        limits=limits,
        enabled=enabled,
    )
    semaphore = threading.BoundedSemaphore(limits.max_concurrency)
    server = ThreadingHTTPServer(("0.0.0.0", 8080), make_handler(agent, semaphore))
    server.daemon_threads = True
    print(
        json.dumps(
            {
                "event": "started",
                "region": region,
                "model_id": model_id,
                "enabled": enabled,
                "limits": limits.__dict__,
            }
        ),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
