"""Purpose-built platform test workload.

This is deliberately small. It exists to exercise the platform, not to be a
product: it has persistent state, a metrics endpoint, health endpoints, an
OTLP trace emitter and a controllable failure mode. Standard library only.
"""
from __future__ import annotations

import http.server
import json
import os
import random
import sqlite3
import threading
import time
import urllib.request
import uuid
from collections import defaultdict

PORT = int(os.environ.get("PORT", "8080"))
DB_PATH = os.environ.get("DB_PATH", "")
ENABLE_FAULTS = os.environ.get("ENABLE_FAULTS", "false").lower() == "true"
LAB_RESPONSE_MODE = os.environ.get("LAB_RESPONSE_MODE", "healthy")
OTLP_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").rstrip("/")
VERSION = os.environ.get("PROBE_VERSION", "dev")
START = time.time()

_lock = threading.Lock()
_requests = defaultdict(int)
_route_requests = defaultdict(int)
_latency_sum = 0.0
_latency_count = 0
_db_errors = 0


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY, at TEXT NOT NULL)"
    )
    return conn


def _init_db() -> None:
    if not DB_PATH:
        return
    with _connect() as conn:
        conn.commit()


def _record_hit() -> int:
    if not DB_PATH:
        return 0
    with _connect() as conn:
        conn.execute("INSERT INTO hits (at) VALUES (datetime('now'))")
        conn.commit()
        return conn.execute("SELECT COUNT(*) FROM hits").fetchone()[0]


def _count_hits() -> int:
    if not DB_PATH:
        return 0
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM hits").fetchone()[0]


def _emit_span(name: str, started: float, attributes: dict[str, str]) -> None:
    """Best-effort OTLP/HTTP JSON span.

    No SDK: the point is to prove the collector pipeline, not to add a
    dependency to a 300-line probe.
    """
    if not OTLP_ENDPOINT:
        return
    end = time.time()
    payload = {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": "platform-probe"}},
                        {"key": "service.version", "value": {"stringValue": VERSION}},
                        {"key": "k8s.pod.name", "value": {"stringValue": os.environ.get("HOSTNAME", "unknown")}},
                    ]
                },
                "scopeSpans": [
                    {
                        "scope": {"name": "platform-probe"},
                        "spans": [
                            {
                                "traceId": f"{int(started):08x}" + os.urandom(12).hex(),
                                "spanId": uuid.uuid4().hex[:16],
                                "name": name,
                                "kind": 2,
                                "startTimeUnixNano": str(int(started * 1_000_000_000)),
                                "endTimeUnixNano": str(int(end * 1_000_000_000)),
                                "attributes": [
                                    {"key": key, "value": {"stringValue": str(value)}}
                                    for key, value in attributes.items()
                                ],
                                "status": {"code": 2 if int(attributes.get("http.status_code", 200)) >= 500 else 1},
                            }
                        ],
                    }
                ],
            }
        ]
    }

    def post() -> None:
        try:
            request = urllib.request.Request(
                f"{OTLP_ENDPOINT}/v1/traces",
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(request, timeout=2).read()
        except Exception:
            # Tracing must never take the probe down.
            pass

    threading.Thread(target=post, daemon=True).start()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        # Keep stdout for meaningful events; access logs are not needed.
        return

    def _send(self, code: int, body: bytes, content_type: str = "text/plain; charset=utf-8") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        global _latency_sum, _latency_count, _db_errors
        started = time.time()
        path = self.path.split("?", 1)[0]
        code = 200

        try:
            if path == "/healthz":
                self._send(200, b"ok\n")
                return

            if path == "/readyz":
                if DB_PATH:
                    try:
                        _count_hits()
                    except sqlite3.Error:
                        _db_errors += 1
                        code = 503
                        self._send(503, b"database unavailable\n")
                        return
                self._send(200, b"ready\n")
                return

            if path == "/metrics":
                self._metrics()
                return

            if path == "/fail" and ENABLE_FAULTS:
                query = self.path.split("?", 1)[1] if "?" in self.path else ""
                mode = dict(
                    part.split("=", 1) for part in query.split("&") if "=" in part
                ).get("mode", "error")
                if mode == "crash":
                    os._exit(1)
                if mode == "latency":
                    time.sleep(5)
                if mode == "error":
                    self._send(500, b"injected failure\n")
                    code = 500
                    return

            if path == "/" and ENABLE_FAULTS and LAB_RESPONSE_MODE == "error":
                code = 500
                self._send(500, b"injected root failure\n")
                return

            if path == "/":
                hits = _record_hit()
                body = json.dumps(
                    {
                        "service": "platform-probe",
                        "version": VERSION,
                        "pod": os.environ.get("HOSTNAME", "unknown"),
                        "hits": hits,
                        "uptime_seconds": round(time.time() - START, 3),
                    }
                ).encode()
                self._send(200, body, "application/json")
                return

            self._send(404, b"not found\n")
            code = 404
        except sqlite3.Error:
            with _lock:
                _db_errors += 1
            code = 503
            self._send(503, b"database error\n")
        except BrokenPipeError:
            code = 499
        finally:
            elapsed = time.time() - started
            with _lock:
                _requests[code] += 1
                # Bound label cardinality: arbitrary URL paths share one label.
                route = path if path in {"/", "/healthz", "/readyz", "/metrics", "/fail"} else "other"
                _route_requests[(route, code)] += 1
                _latency_sum += elapsed
                _latency_count += 1
            _emit_span(
                f"GET {path}",
                started,
                {"http.method": "GET", "http.route": path, "http.status_code": code},
            )

    def _metrics(self) -> None:
        lines = [
            "# HELP probe_requests_total HTTP requests by status code.",
            "# TYPE probe_requests_total counter",
        ]
        with _lock:
            for code, count in sorted(_requests.items()):
                lines.append(f'probe_requests_total{{code="{code}"}} {count}')
            lines += [
                "# HELP probe_route_requests_total HTTP requests by bounded route and status.",
                "# TYPE probe_route_requests_total counter",
            ]
            for (route, code), count in sorted(_route_requests.items()):
                lines.append(f'probe_route_requests_total{{route="{route}",code="{code}"}} {count}')
            lines += [
                "# HELP probe_request_duration_seconds_sum Total request time.",
                "# TYPE probe_request_duration_seconds_sum counter",
                f"probe_request_duration_seconds_sum {_latency_sum:.6f}",
                "# HELP probe_request_duration_seconds_count Total requests timed.",
                "# TYPE probe_request_duration_seconds_count counter",
                f"probe_request_duration_seconds_count {_latency_count}",
                "# HELP probe_db_errors_total Database errors.",
                "# TYPE probe_db_errors_total counter",
                f"probe_db_errors_total {_db_errors}",
            ]
        lines += [
            "# HELP probe_build_info Build metadata.",
            "# TYPE probe_build_info gauge",
            f'probe_build_info{{version="{VERSION}"}} 1',
            "# HELP probe_uptime_seconds Seconds since process start.",
            "# TYPE probe_uptime_seconds gauge",
            f"probe_uptime_seconds {time.time() - START:.3f}",
        ]
        self._send(200, ("\n".join(lines) + "\n").encode(), "text/plain; version=0.0.4")


def main() -> None:
    _init_db()
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.daemon_threads = True
    print(json.dumps({"event": "started", "port": PORT, "version": VERSION, "db": bool(DB_PATH)}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
