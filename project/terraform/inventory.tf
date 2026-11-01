resource "local_file" "inventory" {
  filename = "${path.module}/../ansible/inventory/hosts.yml"

  content = templatefile("${path.module}/templates/inventory.yml.tftpl", {
    project               = var.lab_name
    region                = var.aws_region
    cluster_name          = var.lab_name
    api_endpoint          = "https://${aws_lb.api.dns_name}:6443"
    registration_endpoint = "https://register.${var.private_dns_zone}:9345"
    nlb_dns_name          = aws_lb.api.dns_name
    private_dns_zone      = var.private_dns_zone
    bucket                = aws_s3_bucket.recovery.bucket
    backup_bucket         = aws_s3_bucket.recovery.bucket
    admin_cidr            = var.admin_cidr
    vpc_cidr              = local.vpc_cidr
    cluster_cidr          = local.cluster_cidr
    service_cidr          = local.service_cidr
    rke2_version          = var.rke2_version
    account_id            = data.aws_caller_identity.current.account_id
    bastion_public_ip     = aws_eip.bastion.public_ip
    bastion_private_ip    = aws_instance.bastion.private_ip
    bastion_zone          = aws_instance.bastion.availability_zone
    ssh_key_path          = var.ssh_private_key_path
    servers               = { for name, node in local.nodes : name => node if node.role == "server" }
    agents                = { for name, node in local.nodes : name => node if node.role == "agent" }
  })

  file_permission = "0644"
}
