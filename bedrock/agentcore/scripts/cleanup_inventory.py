"""Read-only residual inventory for the AgentCore lab.

This script never deletes anything. Use it before and after a reviewed
teardown and compare the two outputs.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

import boto3


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", default="us-west-2")
    parser.add_argument("--prefix", default="galland_agentcore")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    control = boto3.client("bedrock-agentcore-control", region_name=args.region)
    logs = boto3.client("logs", region_name=args.region)
    ecr = boto3.client("ecr", region_name=args.region)

    runtimes = control.list_agent_runtimes(maxResults=100).get("agentRuntimes", [])
    gateways = control.list_gateways(maxResults=100).get("items", [])
    log_groups = logs.describe_log_groups(
        logGroupNamePrefix="/aws/bedrock-agentcore/runtimes/"
    ).get("logGroups", [])
    repositories = ecr.describe_repositories().get("repositories", [])

    def runtime_name(item: dict) -> str:
        return str(item.get("agentRuntimeName") or item.get("name") or "")

    def gateway_name(item: dict) -> str:
        return str(item.get("name") or item.get("gatewayName") or "")

    payload = {
        "checked_utc": datetime.now(timezone.utc).isoformat(),
        "region": args.region,
        "prefix": args.prefix,
        "agent_runtimes": [item for item in runtimes if args.prefix in runtime_name(item)],
        "gateways": [item for item in gateways if args.prefix in gateway_name(item)],
        "log_groups": [item for item in log_groups if args.prefix in item.get("logGroupName", "")],
        "ecr_repositories": [
            item
            for item in repositories
            if args.prefix in item.get("repositoryName", "")
            or item.get("repositoryName") == "galland-agentcore"
        ],
        "note": "Read-only inventory. Empty lists are observations, not proof of complete teardown.",
    }
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")

    counts = {key: len(value) for key, value in payload.items() if isinstance(value, list)}
    print(json.dumps({"region": args.region, "counts": counts, "out": args.out}, indent=2))


if __name__ == "__main__":
    main()
