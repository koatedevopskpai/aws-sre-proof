resource "aws_s3_bucket" "recovery" {
  bucket        = "${local.name}-recovery-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  force_destroy = true

  tags = merge(local.labels, { Name = "${local.name}-recovery" })
}

resource "aws_s3_bucket_versioning" "recovery" {
  bucket = aws_s3_bucket.recovery.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "recovery" {
  bucket = aws_s3_bucket.recovery.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "recovery" {
  bucket                  = aws_s3_bucket.recovery.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "recovery" {
  bucket = aws_s3_bucket.recovery.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_ecr_repository" "probe" {
  name                 = "${local.name}/probe"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.labels, { Name = "${local.name}-probe" })
}

resource "aws_ecr_lifecycle_policy" "probe" {
  repository = aws_ecr_repository.probe.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the newest ten images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}
