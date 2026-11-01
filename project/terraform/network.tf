resource "aws_vpc" "lab" {
  cidr_block           = local.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.labels, { Name = "${local.name}-vpc" })
}

resource "aws_internet_gateway" "lab" {
  vpc_id = aws_vpc.lab.id

  tags = merge(local.labels, { Name = "${local.name}-igw" })
}

resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.lab.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = merge(local.labels, {
    Name = "${local.name}-public-${substr(local.azs[count.index], -1, 1)}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.lab.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.labels, {
    Name = "${local.name}-private-${substr(local.azs[count.index], -1, 1)}"
    Tier = "private"
  })
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(local.labels, { Name = "${local.name}-nat-eip" })
}

resource "aws_nat_gateway" "lab" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = merge(local.labels, { Name = "${local.name}-nat" })

  depends_on = [aws_internet_gateway.lab]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.lab.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.lab.id
  }

  tags = merge(local.labels, { Name = "${local.name}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.lab.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.lab.id
  }

  tags = merge(local.labels, { Name = "${local.name}-private-rt" })
}

resource "aws_route_table_association" "private" {
  count          = 3
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "bastion" {
  name        = "${local.name}-bastion"
  description = "Operator SSH entry point"
  vpc_id      = aws_vpc.lab.id

  ingress {
    description = "SSH from the operator public IP"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    description = "Bastion egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.labels, { Name = "${local.name}-bastion-sg" })
}

resource "aws_security_group" "nlb" {
  name        = "${local.name}-nlb"
  description = "Public API and registration load balancer"
  vpc_id      = aws_vpc.lab.id

  ingress {
    description = "Kubernetes API from the operator"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  ingress {
    description = "RKE2 registration from the operator and joining nodes"
    from_port   = 9345
    to_port     = 9345
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr, local.vpc_cidr]
  }

  egress {
    description = "Forward to targets"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.labels, { Name = "${local.name}-nlb-sg" })
}

resource "aws_security_group" "nodes" {
  name        = "${local.name}-nodes"
  description = "RKE2 server and worker traffic"
  vpc_id      = aws_vpc.lab.id

  ingress {
    description = "Node-to-node and pod overlay traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  ingress {
    description     = "SSH from the bastion"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion.id]
  }

  ingress {
    description = "Kubernetes API through the NLB and from the VPC"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr, local.vpc_cidr]
  }

  ingress {
    description = "RKE2 registration through the NLB and from the VPC"
    from_port   = 9345
    to_port     = 9345
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr, local.vpc_cidr]
  }

  ingress {
    description = "etcd, kubelet, node exporter, Cilium health and Hubble"
    from_port   = 2379
    to_port     = 10250
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr]
  }

  ingress {
    description = "NodePort range for in-cluster service tests"
    from_port   = 30000
    to_port     = 32767
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr]
  }

  ingress {
    description = "Cilium VXLAN"
    from_port   = 8472
    to_port     = 8472
    protocol    = "udp"
    cidr_blocks = [local.vpc_cidr]
  }

  ingress {
    description = "ICMP for path MTU discovery"
    from_port   = -1
    to_port     = -1
    protocol    = "icmp"
    cidr_blocks = [local.vpc_cidr]
  }

  egress {
    description = "Package, image and AWS API egress through NAT"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.labels, { Name = "${local.name}-nodes-sg" })
}
