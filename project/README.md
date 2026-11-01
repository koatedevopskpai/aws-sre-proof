# Execution source

This is the source actually used for the measured Galland AWS SRE lab. It is preserved separately from the private runtime records, Terraform state, plans, keys and kubeconfigs.

- Terraform creates the us-east-1 VPC, subnets, NAT, NLB, Route 53, IAM, S3, ECR, CloudWatch, CloudTrail, budget, Lambda and scheduler resources.
- Ansible performs the Ubuntu/RKE2 baseline and lifecycle operations.
- Kubernetes manifests cover Cilium, EBS CSI storage, admission, workload, observability and the alert sink.
- `tests/` contains offline checks for the helpers, plan gate, rendering and S6 rules.

The Kubernetes image references use the documented sample account `123456789012`, the `galland-rke2-use1` repository and an explicit digest placeholder. Replace the digest with the verified ECR image digest before any deployment. Do not deploy from this source unchanged.

```powershell
python -B -m unittest discover -s tests -v
terraform -chdir=terraform fmt -check -recursive
```

Terraform validate needs the pinned providers but no AWS account. Apply, plan and destroy require a separately approved session, a fresh TTL and a reviewed private variable file. See [`../docs/OPERATIONS.md`](../docs/OPERATIONS.md).

No credentials, private keys, state, plans, kubeconfigs or generated inventories belong in this directory.
