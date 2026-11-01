resource "aws_cloudwatch_log_group" "workloads" {
  name              = "/platform-lab/workloads"
  retention_in_days = 14

  tags = merge(local.labels, { Name = "${local.name}-workloads-logs" })
}

resource "aws_cloudwatch_log_group" "audit" {
  name              = "/platform-lab/audit"
  retention_in_days = 30

  tags = merge(local.labels, { Name = "${local.name}-audit-logs" })
}

resource "aws_cloudwatch_log_group" "falco" {
  name              = "/platform-lab/falco"
  retention_in_days = 14

  tags = merge(local.labels, { Name = "${local.name}-falco-logs" })
}

resource "aws_cloudwatch_log_group" "alerts" {
  name              = "/platform-lab/alerts"
  retention_in_days = 14

  tags = merge(local.labels, { Name = "${local.name}-alert-logs" })
}

resource "aws_cloudwatch_log_group" "system" {
  name              = "/platform-lab/system"
  retention_in_days = 14

  tags = merge(local.labels, { Name = "${local.name}-system-logs" })
}

resource "aws_sns_topic" "security" {
  name = "${local.name}-security-events"

  tags = merge(local.labels, { Name = "${local.name}-security-events" })
}

resource "aws_sqs_queue" "security" {
  name                       = "${local.name}-security-events"
  message_retention_seconds  = 86400
  visibility_timeout_seconds = 60

  tags = merge(local.labels, { Name = "${local.name}-security-events" })
}

resource "aws_sqs_queue_policy" "security" {
  queue_url = aws_sqs_queue.security.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSecurityTopic"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.security.arn
        Condition = {
          ArnEquals = { "aws:SourceArn" = aws_sns_topic.security.arn }
        }
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "security_to_sqs" {
  topic_arn            = aws_sns_topic.security.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.security.arn
  raw_message_delivery = true
}

data "archive_file" "security_forwarder" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/security_forwarder"
  output_path = "${path.module}/.build/security_forwarder.zip"
}

resource "aws_lambda_function" "security_forwarder" {
  function_name    = "${local.name}-security-forwarder"
  description      = "Publishes filtered CloudWatch audit events to SNS"
  role             = aws_iam_role.security_forwarder.arn
  handler          = "main.lambda_handler"
  runtime          = "python3.12"
  filename         = data.archive_file.security_forwarder.output_path
  source_code_hash = data.archive_file.security_forwarder.output_base64sha256
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      SECURITY_TOPIC_ARN = aws_sns_topic.security.arn
    }
  }

  tags = merge(local.labels, { Name = "${local.name}-security-forwarder" })
}

resource "aws_lambda_permission" "security_forwarder_logs" {
  statement_id  = "AllowCloudWatchLogsInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.security_forwarder.function_name
  principal     = "logs.amazonaws.com"
  source_arn    = "${aws_cloudwatch_log_group.audit.arn}:*"
}

resource "aws_cloudwatch_log_subscription_filter" "audit_security" {
  name            = "${local.name}-audit-security"
  log_group_name  = aws_cloudwatch_log_group.audit.name
  filter_pattern  = "?\"Forbidden\" ?\"Unauthorized\" ?\"403\""
  destination_arn = aws_lambda_function.security_forwarder.arn

  depends_on = [aws_lambda_permission.security_forwarder_logs]
}
