"""Read-only Nova/Titan quota and model-access recheck.

This script never creates resources or invokes a model. It exits:
  0 - model-level blocker cleared
  1 - still blocked
  2 - check could not be completed

It uses the AWS CLI because the local bundled Python does not include boto3.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

QUOTA_MAP = {
    "us.amazon.nova-2-lite-v1:0": {
        "tpm": ("L-C6F5908D", "cross-region TPM"),
        "rpm": ("L-F06F1187", "cross-region RPM"),
        "daily": ("L-210172B5", "daily token limit"),
    },
    "global.amazon.nova-2-lite-v1:0": {
        "tpm": ("L-71C69B70", "global cross-region TPM"),
        "rpm": ("L-D5F39C2F", "global cross-region RPM"),
        "daily": ("L-AD940EDE", "global daily token limit"),
    },
    "us.anthropic.claude-sonnet-4-6": {
        "tpm": ("L-15B8E632", "cross-region TPM"),
        "rpm": ("L-00FF3314", "cross-region RPM"),
        "daily": (None, "daily token limit code not mapped"),
    },
}

EMBEDDING_QUOTAS = {
    "tpm": ("L-DE641971", "Titan V2 on-demand tokens/minute"),
    "rpm": ("L-26C560CE", "Titan V2 on-demand requests/minute"),
}


def aws_json(args: list[str], region: str) -> dict:
    command = ["aws", *args, "--region", region, "--output", "json"]
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip()[:500] or "AWS CLI command failed")
    return json.loads(result.stdout or "{}")


def quota(region: str, code: str) -> dict:
    data = aws_json(
        ["service-quotas", "get-service-quota", "--service-code", "bedrock", "--quota-code", code],
        region,
    )
    item = data.get("Quota", {})
    return {"code": code, "name": item.get("QuotaName"), "value": item.get("Value")}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", default="us-west-2")
    parser.add_argument("--model", default="us.amazon.nova-2-lite-v1:0")
    parser.add_argument("--embedding", default="amazon.titan-embed-text-v2:0")
    parser.add_argument("--availability-model", default=None)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    mapping = QUOTA_MAP.get(args.model)
    if not mapping:
        print(json.dumps({"error": f"no quota mapping for {args.model}"}, indent=2))
        raise SystemExit(2)

    availability_model = args.availability_model
    if not availability_model:
        availability_model = args.model.split(".", 1)[1] if args.model.startswith(("us.", "global.")) else args.model

    reasons: list[str] = []
    try:
        availability = aws_json(
            ["bedrock", "get-foundation-model-availability", "--model-id", availability_model],
            args.region,
        )
        model_quotas = {}
        for key in ("tpm", "rpm", "daily"):
            code, label = mapping[key]
            if code is None:
                model_quotas[key] = {"label": label, "code": None, "value": None}
                reasons.append(f"{key}: {label}")
                continue
            item = quota(args.region, code)
            item["label"] = label
            model_quotas[key] = item
            if not isinstance(item["value"], (int, float)) or item["value"] <= 0:
                reasons.append(f"{key} is {item['value']} ({code})")

        embedding = {}
        for key in ("tpm", "rpm"):
            code, label = EMBEDDING_QUOTAS[key]
            item = quota(args.region, code)
            item["label"] = label
            embedding[key] = item
    except Exception as exc:  # noqa: BLE001 - report a bounded check failure
        print(json.dumps({"error": str(exc), "region": args.region}, indent=2))
        raise SystemExit(2)

    if availability.get("agreementAvailability", {}).get("status") != "AVAILABLE":
        reasons.append("model agreement is not AVAILABLE")
    for key in ("entitlementAvailability", "regionAvailability"):
        if availability.get(key) != "AVAILABLE":
            reasons.append(f"{key} is not AVAILABLE")

    cleared = not reasons
    payload = {
        "checked_utc": datetime.now(timezone.utc).isoformat(),
        "region": args.region,
        "model": args.model,
        "availability_model": availability_model,
        "availability": availability,
        "model_quotas": model_quotas,
        "embedding_quotas": embedding,
        "blocker_cleared": cleared,
        "reasons": reasons,
        "note": "Read-only check. A pending or denied quota request is not an applied quota.",
    }
    text = json.dumps(payload, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8", newline="\n")
    print(text)
    raise SystemExit(0 if cleared else 1)


if __name__ == "__main__":
    main()
