"""Stop or delete only the EC2 instances tagged for this lab.

AWS Budgets is a notification service, not a hard cap. This function turns a
100 percent budget notification into a stop action and a TTL event into a
terminate action. It never touches untagged account resources.
"""
from __future__ import annotations

import json
import os

import boto3

TAG_KEY = os.environ.get("LAB_TAG_KEY", "Project")
TAG_VALUE = os.environ.get("LAB_TAG_VALUE", "aws-platform-lab")
ec2 = boto3.client("ec2")


def _message(event: dict) -> dict:
    records = event.get("Records") or []
    if records and records[0].get("EventSource") == "aws:sns":
        return json.loads(records[0]["Sns"]["Message"])
    return event


def _threshold(message: dict) -> float:
    for key in ("threshold", "alertThresholdExceeded", "budgetNotification"):
        value = message.get(key)
        if isinstance(value, dict):
            value = value.get("threshold")
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return 0.0


def _instances(states: list[str]):
    paginator = ec2.get_paginator("describe_instances")
    for page in paginator.paginate(
        Filters=[
            {"Name": f"tag:{TAG_KEY}", "Values": [TAG_VALUE]},
            {"Name": "instance-state-name", "Values": states},
        ]
    ):
        for reservation in page.get("Reservations", []):
            yield from reservation.get("Instances", [])


def lambda_handler(event, context):
    message = _message(event)
    action = message.get("action")
    threshold = _threshold(message)
    if not action:
        action = "stop" if threshold >= 100 else None

    if action not in ("stop", "delete"):
        print(json.dumps({
            "event": "ignored",
            "threshold": threshold,
            "reason": "not a 100 percent budget event or TTL action",
        }))
        return {"ok": True, "action": "ignored"}

    states = ["running", "stopping"] if action == "stop" else [
        "running", "stopping", "stopped"
    ]
    actions = []
    for instance in _instances(states):
        instance_id = instance["InstanceId"]
        try:
            if action == "delete":
                ec2.terminate_instances(InstanceIds=[instance_id])
            else:
                ec2.stop_instances(InstanceIds=[instance_id])
            actions.append({"instance": instance_id, "result": action})
        except Exception as error:  # noqa: BLE001 - record and continue
            actions.append({"instance": instance_id, "error": str(error)[:200]})

    print(json.dumps({
        "event": "guard_action",
        "action": action,
        "tag": f"{TAG_KEY}={TAG_VALUE}",
        "threshold": threshold,
        "actions": actions,
    }))
    return {"ok": True, "action": action, "instances": len(actions)}
