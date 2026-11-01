data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

resource "aws_key_pair" "lab" {
  key_name   = "${local.name}-ed25519"
  public_key = file(var.ssh_public_key_path)

  tags = merge(local.labels, { Name = "${local.name}-key" })
}

locals {
  node_user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y python3 python3-apt curl ca-certificates jq unzip
  EOF

  bastion_user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y python3 python3-apt curl ca-certificates jq unzip
    systemctl enable --now ssh
  EOF
}

resource "aws_instance" "node" {
  for_each = local.nodes

  ami                         = data.aws_ssm_parameter.ubuntu.value
  instance_type               = each.value.instance_type
  subnet_id                   = aws_subnet.private[each.value.subnet_index].id
  private_ip                  = each.value.private_ip
  vpc_security_group_ids      = [aws_security_group.nodes.id]
  iam_instance_profile        = aws_iam_instance_profile.node.name
  key_name                    = aws_key_pair.lab.key_name
  associate_public_ip_address = false
  user_data                   = local.node_user_data

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_size           = each.value.disk_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  tags = merge(local.labels, {
    Name = each.key
    Role = each.value.role
    Zone = each.value.zone
  })

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ssm_parameter.ubuntu.value
  instance_type               = var.bastion_instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  iam_instance_profile        = aws_iam_instance_profile.bastion.name
  key_name                    = aws_key_pair.lab.key_name
  associate_public_ip_address = true
  user_data                   = local.bastion_user_data

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size           = var.bastion_disk_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  tags = merge(local.labels, {
    Name = "${local.name}-bastion"
    Role = "bastion"
  })

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip" "bastion" {
  domain   = "vpc"
  instance = aws_instance.bastion.id

  tags = merge(local.labels, { Name = "${local.name}-bastion-eip" })
}
