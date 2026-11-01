variable "aws_region" {
  description = "AWS region for the lab."
  type        = string
  default     = "us-east-1"
}

variable "lab_name" {
  description = "Name prefix for every resource."
  type        = string
  default     = "galland-rke2-use1"
}

variable "vpc_cidr" {
  description = "Dedicated lab VPC CIDR. Do not reuse the default VPC."
  type        = string
  default     = "10.60.0.0/16"
}

variable "admin_cidr" {
  description = "Operator public IP in CIDR form. SSH and API access are limited to this."
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0))
    error_message = "admin_cidr must be a valid CIDR."
  }
}

variable "monthly_budget_usd" {
  description = "Monthly AWS budget. At 100 percent the guard stops tagged lab instances."
  type        = number
  default     = 25
}

variable "session_ttl" {
  description = "One-time UTC schedule for the delete guard, for example 2026-10-26T03:00:00Z."
  type        = string
}

variable "rke2_version" {
  description = "Pinned RKE2 release."
  type        = string
  default     = "v1.36.5+rke2r1"
}

variable "server_count" {
  description = "Control-plane/etcd nodes. Three is the minimum for quorum tolerance."
  type        = number
  default     = 3

  validation {
    condition     = var.server_count == 3
    error_message = "This lab is designed for exactly three servers."
  }
}

variable "agent_count" {
  description = "Worker count. Four keeps capacity during a replacement and spreads over three AZs."
  type        = number
  default     = 4

  validation {
    condition     = var.agent_count >= 3 && var.agent_count <= 4
    error_message = "agent_count must be 3 or 4 to remain inside the 16 vCPU quota."
  }
}

variable "server_instance_type" {
  description = "Control-plane instance type."
  type        = string
  default     = "m5.large"
}

variable "agent_instance_type" {
  description = "Worker instance type."
  type        = string
  default     = "m5.large"
}

variable "bastion_instance_type" {
  description = "Bastion instance type."
  type        = string
  default     = "t3.micro"
}

variable "server_disk_gb" {
  description = "Control-plane root volume."
  type        = number
  default     = 50
}

variable "agent_disk_gb" {
  description = "Worker root volume."
  type        = number
  default     = 50
}

variable "bastion_disk_gb" {
  description = "Bastion root volume."
  type        = number
  default     = 20
}

variable "private_dns_zone" {
  description = "Private Route53 zone for the API and registration endpoints."
  type        = string
  default     = "galland-rke2-use1.aws.internal"
}

variable "owner_email" {
  description = "Owner label used for attribution."
  type        = string
  default     = "you@example.com"
}

variable "ttl" {
  description = "Human-readable expiry label."
  type        = string
  default     = "REPLACE_WITH_SESSION_DATE"
}

variable "project_tag" {
  description = "Unique Project tag for this extension; also scopes the compute guard."
  type        = string
  default     = "galland-rke2-use1"
}

variable "expected_account_id" {
  description = "Verified 12-digit target AWS account; provider refuses other accounts."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.expected_account_id))
    error_message = "expected_account_id must be a verified 12-digit AWS account ID."
  }
}

variable "ssh_public_key_path" {
  description = "Local public key file. Never copy the private key into this package."
  type        = string
}

variable "ssh_private_key_path" {
  description = "Private key path on the Linux/WSL Ansible controller; path only."
  type        = string
}
