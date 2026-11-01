#!/usr/bin/env bash
set -euo pipefail

# Build the ARM64 AgentCore Runtime image and push it to ECR.
# This is a deployment action. It requires an explicit --yes and a reviewed
# session approval. It creates the ECR repository only when --create-repo is
# supplied; otherwise the repository must already exist.

usage() {
  echo "Usage: AWS_ACCOUNT_ID=... AWS_REGION=us-west-2 $0 --yes [--create-repo]" >&2
  exit 2
}

[[ "${1:-}" == "--yes" ]] || usage
create_repo=false
[[ "${2:-}" == "--create-repo" ]] && create_repo=true

: "${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID}"
: "${AWS_REGION:=us-west-2}"
: "${ECR_REPO:=galland-agentcore}"
: "${IMAGE_TAG:=20261031-local}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if [[ "$create_repo" == "true" ]]; then
  if ! aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" >/dev/null 2>&1; then
    aws ecr create-repository \
      --repository-name "$ECR_REPO" \
      --region "$AWS_REGION" \
      --image-scanning-configuration scanOnPush=true \
      --encryption-configuration encryptionType=AES256 >/dev/null
  fi
fi

aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" >/dev/null
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"
docker buildx build \
  --platform linux/arm64 \
  --provenance=false \
  --tag "$IMAGE_URI" \
  --push \
  "$(cd "$(dirname "$0")/.." && pwd)"

echo "IMAGE_URI=$IMAGE_URI"
echo "Record the pushed digest, not only the mutable tag."
