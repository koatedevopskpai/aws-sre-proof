"""Forward filtered CloudWatch Logs audit events to the security SNS topic."""
from __future__ import annotations

import base64
import gzip
import json
import os

import boto3

TOPIC_ARN = os.environ["SECURITY_TOPIC_ARN"]
sns = boto3.client("sns")


def lambda_handler(event, context):
    raw = gzip.decompress(base64.b64decode(event["awslogs"]["data"]))
    payload = json.loads(raw)
    delivered = 0
    for record in payload.get("logEvents", []):
        body = {
            "source": "cloudwatch-logs",
            "log_group": payload.get("logGroup"),
            "log_stream": payload.get("logStream"),
            "timestamp": record.get("timestamp"),
            "message": record.get("message", "")[:8000],
        }
        sns.publish(
            TopicArn=TOPIC_ARN,
            Subject="platform-lab security event",
            Message=json.dumps(body),
        )
        delivered += 1

    print(json.dumps({
        "event": "security_forward",
        "log_group": payload.get("logGroup"),
        "delivered": delivered,
    }))
    return {"delivered": delivered}
