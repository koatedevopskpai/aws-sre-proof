# Security policy

## Scope

This repository is a public portfolio record of a completed, synthetic AWS reliability lab. It contains Terraform, Ansible, Kubernetes manifests, test code and a local-only AgentCore and Bedrock implementation.

It does not operate a live service, a supported product, a public endpoint or an AWS account. The lab environment was destroyed after the recorded exercises. No credentials, private keys, kubeconfigs, Terraform state or account-specific configuration are published.

The controls exercised in the lab and its known findings are described in [`docs/SECURITY.md`](../docs/SECURITY.md).

## Reporting a vulnerability

Report suspected vulnerabilities privately through GitHub's private vulnerability reporting:

1. Open the **Security** tab of this repository.
2. Select **Report a vulnerability**.
3. Include the affected path or commit, the impact you believe is possible, and reproduction steps.

Do not open a public issue for a suspected vulnerability, and do not include secrets, credentials or personal data in a report.

This is a personal portfolio project maintained on a best-effort basis. There is no service-level agreement, bug bounty or guaranteed response time, but credible reports will be reviewed and the repository corrected where appropriate.

## Out of scope

The following are deliberate characteristics of the lab and are not vulnerabilities in themselves:

- the intentionally vulnerable probe image (`project/workloads/probe/Dockerfile.vulnerable`) and its recorded HIGH findings;
- placeholder identifiers, including the sample AWS account `123456789012` and the image digest placeholder;
- lab-only choices documented in `docs/SECURITY.md`, such as the EBS CSI host-networking workaround and the single-instance Prometheus;
- missing production hardening, high availability, multi-region design or commercial support;
- findings in third-party dependencies that have already been reported upstream.

## Testing boundaries

Only test against your own copy of this repository. Do not probe, scan or attempt to access any AWS account, host or endpoint that you do not own or have explicit permission to test. This project operates no live infrastructure.

## Safe harbour

Good-faith research that respects these boundaries is welcome. The maintainer will not pursue action against researchers who avoid privacy violations, data destruction and service disruption, and who report findings privately and promptly.
