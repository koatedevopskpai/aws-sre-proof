# Architecture

## Topology

```text
Operator /32
   |
   v
Bastion (t3.micro, public subnet)
   |
   v
Public NLB :6443 / :9345
   |
   v
3 x m5.large RKE2 servers (private subnets, one per AZ)
4 x m5.large RKE2 workers (private subnets, spread across AZs)
   |
   +-- Cilium with kube-proxy replacement
   +-- EBS CSI gp3 storage
   +-- probe application + Prometheus/Alertmanager
   +-- Fluent Bit + OpenTelemetry Collector + Falco
   +-- Argo CD (lab-local Git source)
```

The VPC is dedicated (`10.60.0.0/16`), with three public and three private subnets. A single NAT gateway provides private egress. The bastion is the operator entry point; node SSH and the Kubernetes API are restricted to the operator CIDR and the VPC.

## Infrastructure ownership

Terraform owns the VPC, subnets, routes, NAT, NLB, security groups, Route 53 private zone, IAM roles and policies, S3 recovery and CloudTrail buckets, ECR, CloudWatch log groups, SNS/SQS security path, budget, spend-guard Lambda and EventBridge Scheduler TTL. Ansible owns the host baseline and RKE2. Kubernetes manifests own the platform workloads and policies.

## Controls

- **Account scope:** the AWS provider uses `allowed_account_ids`; a wrong account fails before mutation.
- **Tag scope:** the `Project=galland-rke2-use1` tag scopes the compute guard and cleanup inventory.
- **State isolation:** a dedicated state key and separate Terraform data directory; the historical backend is retained separately.
- **Access:** operator CIDR restrictions, pinned SSH host keys, no shared broad credentials.
- **Admission:** tenant images must come from the lab ECR repository and be digest-pinned.
- **Audit:** Kubernetes audit policy records Secrets at Metadata level; Fluent Bit removes request/response bodies before shipping.
- **Guard:** the budget Lambda stops tagged compute at 100% and the TTL schedule deletes tagged compute. Neither is a complete cleanup or a hard billing cap.

## Lifecycle exercises

The lab exercised worker replacement, one non-bootstrap control-plane replacement, a same-minor RKE2 patch upgrade, one API leaf-certificate rotation, Argo CD sync/drift/revert, and an application fault with alert delivery and recovery. The exact observed results and limits are in [`RESULTS.md`](RESULTS.md).

## Deliberate lab constraints

Single NAT gateway, single Prometheus instance, lab-local Git, in-cluster alert receiver and synthetic data. These are cost and scope choices, not production architecture claims.
