resource "aws_sns_topic" "budget" {
  name = "${local.name}-budget-alerts"

  tags = merge(local.labels, { Name = "${local.name}-budget-alerts" })
}

resource "aws_sns_topic_policy" "budget" {
  arn = aws_sns_topic.budget.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowBudgetsPublish"
        Effect    = "Allow"
        Principal = { Service = "budgets.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.budget.arn
      }
    ]
  })
}

resource "aws_budgets_budget" "lab" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 50
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.budget.arn]
  }

  tags = merge(local.labels, { Name = "${local.name}-monthly-budget" })
}

data "archive_file" "spend_guard" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/spend_guard"
  output_path = "${path.module}/.build/spend_guard.zip"
}

resource "aws_lambda_function" "spend_guard" {
  function_name    = "${local.name}-spend-guard"
  description      = "Stops tagged lab EC2 at 100 percent budget and deletes them at the TTL"
  role             = aws_iam_role.spend_guard.arn
  handler          = "main.lambda_handler"
  runtime          = "python3.12"
  filename         = data.archive_file.spend_guard.output_path
  source_code_hash = data.archive_file.spend_guard.output_base64sha256
  timeout          = 120
  memory_size      = 256

  environment {
    variables = {
      LAB_TAG_KEY   = "Project"
      LAB_TAG_VALUE = var.project_tag
    }
  }

  tags = merge(local.labels, { Name = "${local.name}-spend-guard" })
}

resource "aws_lambda_permission" "spend_guard_sns" {
  statement_id  = "AllowBudgetSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.spend_guard.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.budget.arn
}

resource "aws_sns_topic_subscription" "spend_guard" {
  topic_arn = aws_sns_topic.budget.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.spend_guard.arn
}

resource "aws_scheduler_schedule" "ttl_delete" {
  name       = "${local.name}-ttl-delete"
  group_name = "default"

  schedule_expression          = "at(${replace(var.session_ttl, "Z", "")})"
  schedule_expression_timezone = "UTC"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.spend_guard.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ action = "delete", source = "eventbridge-scheduler" })
  }

  depends_on = [aws_iam_role_policy.scheduler]
}

resource "aws_lambda_permission" "spend_guard_scheduler" {
  statement_id  = "AllowSchedulerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.spend_guard.function_name
  principal     = "scheduler.amazonaws.com"
  source_arn    = aws_scheduler_schedule.ttl_delete.arn
}
