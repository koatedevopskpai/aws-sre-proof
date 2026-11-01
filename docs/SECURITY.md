# Security notes

## Controls exercised

- Dedicated VPC and security groups; SSH and API access restricted to the operator CIDR and the VPC.
- SSH host-key verification against EC2 console fingerprints; no `StrictHostKeyChecking=no` shortcut.
- IAM instance profiles for nodes and bastion; no static access keys created for the workload.
- Account allow-list on the AWS provider, unique Project tag and region-scoped guard permissions.
- Kubernetes image provenance admission; images must come from the lab ECR repository and be digest-pinned.
- Kubernetes audit policy records Secrets at **Metadata** level; Fluent Bit removes request/response bodies.
- Security-event path: CloudWatch Logs subscription filter -> Lambda -> SNS -> SQS. A forced denied Secret read was observed as a 403 and its metadata event reached CloudWatch without secret bodies. The event was not correlated end-to-end through SQS, so no full delivery claim is made.
- Cleanup verifies that lab resources are removed and that unrelated resources, the retained backend and the unrelated Elastic IP are preserved.

## Known findings

- The probe image scan reported **4 HIGH / 9 MEDIUM / 3 LOW**. Remediation and rescan are outstanding. This repository does not claim a vulnerability-free or production-ready image.
- The EBS CSI controller uses a host-networking workaround to obtain node instance-profile credentials. This is a lab workaround, not IRSA or Pod Identity, and is not presented as best practice.
- Prometheus is single-instance. The alert receiver is in-cluster and CloudWatch Logs only, not a human paging system.
- The lab used a synthetic workload and synthetic data. No production or customer data is included.

## Repository hygiene

No credentials, private keys, kubeconfigs, Terraform state/plans, real variable files, generated inventories or raw private evidence are included. The Kubernetes image references use a documented sample account and an explicit digest placeholder. Do not deploy from this source unchanged.
