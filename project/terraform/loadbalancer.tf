resource "aws_lb" "api" {
  name                             = "${local.name}-api"
  internal                         = false
  load_balancer_type               = "network"
  subnets                          = aws_subnet.public[*].id
  security_groups                  = [aws_security_group.nlb.id]
  enable_deletion_protection       = false
  enable_cross_zone_load_balancing = true

  tags = merge(local.labels, { Name = "${local.name}-api-nlb" })
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name}-api"
  port        = 6443
  protocol    = "TCP"
  vpc_id      = aws_vpc.lab.id
  target_type = "instance"

  health_check {
    protocol            = "TCP"
    port                = "traffic-port"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  deregistration_delay = 30

  tags = merge(local.labels, { Name = "${local.name}-api-tg" })
}

resource "aws_lb_target_group" "registration" {
  name        = "${local.name}-registration"
  port        = 9345
  protocol    = "TCP"
  vpc_id      = aws_vpc.lab.id
  target_type = "instance"

  health_check {
    protocol            = "TCP"
    port                = "traffic-port"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  deregistration_delay = 30

  tags = merge(local.labels, { Name = "${local.name}-registration-tg" })
}

resource "aws_lb_target_group_attachment" "api" {
  for_each         = toset(local.server_names)
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.node[each.value].id
  port             = 6443
}

resource "aws_lb_target_group_attachment" "registration" {
  for_each         = toset(local.server_names)
  target_group_arn = aws_lb_target_group.registration.arn
  target_id        = aws_instance.node[each.value].id
  port             = 9345
}

resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api.arn
  port              = 6443
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = merge(local.labels, { Name = "${local.name}-api-listener" })
}

resource "aws_lb_listener" "registration" {
  load_balancer_arn = aws_lb.api.arn
  port              = 9345
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.registration.arn
  }

  tags = merge(local.labels, { Name = "${local.name}-registration-listener" })
}

resource "aws_route53_zone" "private" {
  name = var.private_dns_zone

  vpc {
    vpc_id     = aws_vpc.lab.id
    vpc_region = var.aws_region
  }

  tags = merge(local.labels, { Name = "${local.name}-private-zone" })
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.private.zone_id
  name    = "api.${var.private_dns_zone}"
  type    = "CNAME"
  ttl     = 60
  records = [aws_lb.api.dns_name]
}

resource "aws_route53_record" "registration" {
  zone_id = aws_route53_zone.private.zone_id
  name    = "register.${var.private_dns_zone}"
  type    = "CNAME"
  ttl     = 60
  records = [aws_lb.api.dns_name]
}
