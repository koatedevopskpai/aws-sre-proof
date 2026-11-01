"""Invoke one deployed AgentCore Runtime for evidence capture.

This script performs a real, potentially billable model invocation. Do not run
it during local preparation. It requires an approved live session.
"""
from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone

import boto3


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-arn", required=True)
    parser.add_argument("--region", default="us-west-2")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--session-id", default=None)
    parser.add_argument("--qualifier", default=None)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    session_id = args.session_id or str(uuid.uuid4())
    client = boto3.client("bedrock-agentcore", region_name=args.region)
    kwargs = {
        "agentRuntimeArn": args.runtime_arn,
        "runtimeSessionId": session_id,
        "payload": json.dumps({"prompt": args.prompt}, separators=(",", ":")).encode("utf-8"),
    }
    if args.qualifier:
        kwargs["qualifier"] = args.qualifier

    response = client.invoke_agent_runtime(**kwargs)
    body = response.get("response")
    raw = body.read() if hasattr(body, "read") else body
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")

    receipt = {
        "invoked_utc": datetime.now(timezone.utc).isoformat(),
        "region": args.region,
        "runtime_arn": args.runtime_arn,
        "qualifier": args.qualifier,
        "session_id": session_id,
        "request_id": response.get("ResponseMetadata", {}).get("RequestId"),
        "response": raw,
    }
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(receipt, handle, indent=2)
        handle.write("\n")
    print(json.dumps({k: receipt[k] for k in ("invoked_utc", "session_id", "request_id")}, indent=2))


if __name__ == "__main__":
    main()
