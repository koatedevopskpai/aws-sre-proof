"""Export AgentCore log and optional X-Ray evidence for one approved run.

Read-only against AWS. Requires an approved live session and a known run ID.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

import boto3


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", default="us-west-2")
    parser.add_argument("--log-group", required=True)
    parser.add_argument("--start", required=True, help="UTC ISO-8601 start")
    parser.add_argument("--end", required=True, help="UTC ISO-8601 end")
    parser.add_argument("--trace-id", action="append", default=[])
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    start = datetime.fromisoformat(args.start.replace("Z", "+00:00"))
    end = datetime.fromisoformat(args.end.replace("Z", "+00:00"))
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise SystemExit("start/end must be aware UTC times and end must be later")

    logs = boto3.client("logs", region_name=args.region)
    events = []
    kwargs = {
        "logGroupName": args.log_group,
        "startTime": int(start.timestamp() * 1000),
        "endTime": int(end.timestamp() * 1000),
        "limit": 10000,
    }
    while True:
        page = logs.filter_log_events(**kwargs)
        for event in page.get("events", []):
            events.append(
                {
                    "timestamp": event.get("timestamp"),
                    "log_stream": event.get("logStreamName"),
                    "message": event.get("message", "")[:16000],
                }
            )
        token = page.get("nextToken")
        if not token:
            break
        kwargs["nextToken"] = token

    traces = []
    if args.trace_id:
        xray = boto3.client("xray", region_name=args.region)
        result = xray.batch_get_traces(TraceIds=args.trace_id)
        traces = result.get("Traces", [])

    payload = {
        "exported_utc": datetime.now(timezone.utc).isoformat(),
        "region": args.region,
        "log_group": args.log_group,
        "start": args.start,
        "end": args.end,
        "events": events,
        "trace_ids": args.trace_id,
        "traces": traces,
        "limits": [
            "Logs and traces are only what the service actually emitted.",
            "Missing spans remain missing; do not infer end-to-end correlation.",
            "Content may contain sensitive payloads; review before publication.",
        ],
    }
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(json.dumps({"events": len(events), "traces": len(traces), "out": args.out}, indent=2))


if __name__ == "__main__":
    main()
