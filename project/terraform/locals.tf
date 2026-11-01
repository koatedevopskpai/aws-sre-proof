locals {
  name = var.lab_name

  labels = {
    Project     = var.project_tag
    Environment = "lab"
    Owner       = replace(lower(var.owner_email), "/[^a-z0-9_.@-]/", "-")
    CostCenter  = "platform-lab"
    ManagedBy   = "terraform"
    TTL         = var.ttl
  }

  azs      = slice(data.aws_availability_zones.available.names, 0, 3)
  vpc_cidr = var.vpc_cidr

  public_subnet_cidrs  = [for i in range(3) : cidrsubnet(local.vpc_cidr, 8, i)]
  private_subnet_cidrs = [for i in range(3) : cidrsubnet(local.vpc_cidr, 8, 10 + i)]

  server_names = [for i in range(var.server_count) : format("%s-server-%d", local.name, i + 1)]
  agent_names  = [for i in range(var.agent_count) : format("%s-agent-%d", local.name, i + 1)]
  agent_zones  = [for i in range(var.agent_count) : local.azs[i % length(local.azs)]]

  nodes = merge(
    {
      for i, name in local.server_names : name => {
        role          = "server"
        zone          = local.azs[i]
        subnet_index  = i
        private_ip    = cidrhost(local.private_subnet_cidrs[i], 11)
        instance_type = var.server_instance_type
        disk_gb       = var.server_disk_gb
      }
    },
    {
      for i, name in local.agent_names : name => {
        role          = "agent"
        zone          = local.agent_zones[i]
        subnet_index  = i % length(local.azs)
        private_ip    = cidrhost(local.private_subnet_cidrs[i % length(local.azs)], 21 + i)
        instance_type = var.agent_instance_type
        disk_gb       = var.agent_disk_gb
      }
    }
  )

  cluster_cidr = "10.42.0.0/16"
  service_cidr = "10.43.0.0/16"
}
