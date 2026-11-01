data "aws_iam_policy_document" "ec2_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  name               = "${local.name}-node"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
  description        = "EC2 role for RKE2 nodes, EBS CSI, CloudWatch and X-Ray"

  tags = merge(local.labels, { Name = "${local.name}-node-role" })
}

resource "aws_iam_role_policy_attachment" "node_ssm" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "node_cloudwatch" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy_attachment" "node_ebs_csi" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_iam_role_policy_attachment" "node_ecr" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "node_xray" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

data "aws_iam_policy_document" "node_recovery" {
  statement {
    sid    = "ListRecoveryBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [aws_s3_bucket.recovery.arn]
  }

  statement {
    sid    = "ReadWriteRecoveryObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
    ]
    resources = ["${aws_s3_bucket.recovery.arn}/*"]
  }
}

resource "aws_iam_role_policy" "node_recovery" {
  name   = "${local.name}-recovery-access"
  role   = aws_iam_role.node.id
  policy = data.aws_iam_policy_document.node_recovery.json
}

resource "aws_iam_instance_profile" "node" {
  name = "${local.name}-node"
  role = aws_iam_role.node.name
}

resource "aws_iam_role" "bastion" {
  name               = "${local.name}-bastion"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
  description        = "Bastion Session Manager role"

  tags = merge(local.labels, { Name = "${local.name}-bastion-role" })
}

resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${local.name}-bastion"
  role = aws_iam_role.bastion.name
}

resource "aws_iam_role" "spend_guard" {
  name               = "${local.name}-spend-guard"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  description        = "Stops or deletes tagged lab instances on budget and TTL events"

  tags = merge(local.labels, { Name = "${local.name}-spend-guard-role" })
}

data "aws_iam_policy_document" "spend_guard" {
  statement {
    effect    = "Allow"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeTags"]
    resources = ["*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["ec2:StopInstances", "ec2:TerminateInstances"]
    resources = ["arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Project"
      values   = [var.project_tag]
    }
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "spend_guard" {
  name   = "${local.name}-spend-guard"
  role   = aws_iam_role.spend_guard.id
  policy = data.aws_iam_policy_document.spend_guard.json
}

resource "aws_iam_role" "security_forwarder" {
  name               = "${local.name}-security-forwarder"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  description        = "Publishes filtered CloudWatch audit events to SNS"

  tags = merge(local.labels, { Name = "${local.name}-security-forwarder-role" })
}

data "aws_iam_policy_document" "security_forwarder" {
  statement {
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.security.arn]
  }

  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "security_forwarder" {
  name   = "${local.name}-security-forwarder"
  role   = aws_iam_role.security_forwarder.id
  policy = data.aws_iam_policy_document.security_forwarder.json
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
  description        = "Invokes the spend guard at the session TTL"

  tags = merge(local.labels, { Name = "${local.name}-scheduler-role" })
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.spend_guard.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "${local.name}-scheduler"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}
