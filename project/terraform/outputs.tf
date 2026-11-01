output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "region" {
  value = var.aws_region
}

output "vpc_id" {
  value = aws_vpc.lab.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "servers" {
  value = {
    for name, node in local.nodes : name => {
      ip          = node.private_ip
      zone        = node.zone
      instance_id = aws_instance.node[name].id
      role        = node.role
    } if node.role == "server"
  }
}

output "agents" {
  value = {
    for name, node in local.nodes : name => {
      ip          = node.private_ip
      zone        = node.zone
      instance_id = aws_instance.node[name].id
      role        = node.role
    } if node.role == "agent"
  }
}

output "bastion_public_ip" {
  value = aws_eip.bastion.public_ip
}

output "bastion_private_ip" {
  value = aws_instance.bastion.private_ip
}

output "bastion_zone" {
  value = aws_instance.bastion.availability_zone
}

output "api_endpoint" {
  value = "https://api.${var.private_dns_zone}:6443"
}

output "operator_api_endpoint" {
  value = "https://${aws_lb.api.dns_name}:6443"
}

output "registration_endpoint" {
  value = "https://register.${var.private_dns_zone}:9345"
}

output "nlb_dns_name" {
  value = aws_lb.api.dns_name
}

output "recovery_bucket" {
  value = aws_s3_bucket.recovery.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.probe.repository_url
}

output "spend_guard_function" {
  value = aws_lambda_function.spend_guard.function_name
}

output "budget_topic" {
  value = aws_sns_topic.budget.arn
}

output "security_topic" {
  value = aws_sns_topic.security.arn
}

output "security_queue_url" {
  value = aws_sqs_queue.security.id
}

output "audit_log_group" {
  value = aws_cloudwatch_log_group.audit.name
}

output "cloudtrail_trail" {
  value = aws_cloudtrail.lab.name
}

output "inventory_file" {
  value = local_file.inventory.filename
}
