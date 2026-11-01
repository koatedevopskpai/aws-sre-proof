# Galland AWS SRE Proof

This project demonstrates how a seven-node Kubernetes platform on AWS behaves during maintenance, failed releases and application faults. Terraform and Ansible provisioned the environment; recorded exercises covered node replacement, a patch upgrade, API leaf-certificate rotation, GitOps recovery and alert delivery. Selected sanitised evidence and reproducible source are included.

**Phase 1:** the independent synthetic lab ran live in `us-east-1` and was torn down with cleanup verification. The final run was `20261031T151734Z-galland`; the worker-replacement measurement comes from an earlier run. Unrelated account resources and the retained Terraform backend were excluded from teardown. Final billing is not yet reconciled.

**AgentCore extension:** implemented and tested locally. Its model-backed live demonstration is blocked because AWS declined the selected Nova 2 Lite cross-region quota request in `us-west-2`. That decision is not a blanket denial of Bedrock or AgentCore access. No live AgentCore deployment or invocation is claimed. See [access status](bedrock/ACCESS-STATUS.md).

## Measured results

| Exercise | Observed result |
|---|---|
| S0 baseline | 96 Terraform resources; 3 server + 4 worker RKE2 nodes Ready; Cilium, EBS CSI, application, three gp3 PVCs and Prometheus verified |
| S1 worker replacement | Earlier run: 600/600 accepted requests over 10 minutes at 1 req/s; p95 48.598 ms; first observer failed, so no availability claim for that attempt |
| S2 control-plane replacement | One non-bootstrap server replaced by a distinct EC2 instance; old terminated; 3 healthy etcd endpoints; 7 Ready; PVC UIDs retained |
| S3 patch upgrade | All 7 nodes moved from `v1.36.4+rke2r1` to `v1.36.5+rke2r1`; API, etcd and application checks passed; no continuous-availability claim |
| S4 leaf rotation | One server API leaf fingerprint changed and matched the directly verified endpoint; no CA rotation |
| S5 GitOps | Argo CD synced revision A, healed replica drift, observed readiness-regressed B as Degraded, then synced a Git revert to Healthy; lab-local Git, not GitHub |
| S6 fault/alert/recovery | 180/180 baseline accepted; 228 failures of 240 fault-window requests; 300/300 recovery accepted; firing/resolved receiver receipts and CloudWatch readback |
| S7 cleanup | 96 managed resources destroyed; empty managed state; final 21-category audit passed; unrelated resources preserved |

Read [`docs/RESULTS.md`](docs/RESULTS.md), [`CLAIM-LEDGER.json`](CLAIM-LEDGER.json) and [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

## AWS SRE competencies demonstrated

- Terraform-owned VPC, subnets, NAT, NLB, Route 53, IAM, S3, ECR, CloudWatch, CloudTrail, budgets, Lambda and EventBridge Scheduler.
- Account allow-listing, region/tag scoping, dedicated state key and a compute guard restricted to tagged lab instances.
- Ubuntu/RKE2 baseline through Ansible, with host-key verification and token-log suppression.
- Worker and control-plane replacement with etcd quorum preserved and persistent-volume identity checked.
- Version-aware, one-node-at-a-time RKE2 patch upgrade.
- API leaf-certificate rotation with direct endpoint verification.
- Argo CD delivery, drift self-heal, bad-readiness observation and Git revert.
- Application-level fault injection, alert firing/resolution and recovery measurement.
- Evidence-led cleanup: dynamic PV removal, exact-state destroy, independent residual inventory and retained-resource exclusions.
- Cost controls and an explicit distinction between a budget notification, a TTL guard and a billing cap.

## Evidence and limitations

The [evidence index](evidence/README.md) maps claims to selected runtime excerpts, worker observations, cleanup summaries and reviewed screenshots. The [screenshot manifest](docs/capture/images/MANIFEST.json) records provenance and scope; documentation screenshots show saved records, not live runtime behaviour.

These are bounded lab results, not production-scale operation, a monthly SLO or commercial on-call experience. The upgrade has before/after health checks rather than a continuous-availability measurement. Raw private records, credentials, state and account-specific inventories are withheld. Read the [limitations](docs/LIMITATIONS.md) alongside the results. The probe image's recorded scan includes unresolved HIGH findings; no production-ready or vulnerability-free claim is made.

## AgentCore extension — local implementation

The AgentCore Runtime implementation includes an ARM64 HTTP container, read-only tool contracts, execution bounds, a kill switch and CDK infrastructure synthesis. Ten local tests and `synth:agentcore` passed in the recorded checks. Live deployment, model responses, tool execution and cloud traces remain **NOT RUN**.

A separate [Bedrock companion](bedrock/local-implementation/) implements a knowledge base, scoped tools, an MCP server, a Step Functions loop and a managed Bedrock Agent. Its 14 local tests and TypeScript build passed. Bedrock Agents and AgentCore Runtime are distinct implementations; neither has live evidence in this project.

See the [extension overview](bedrock/README.md), [access status](bedrock/ACCESS-STATUS.md) and [competency map](bedrock/COMPETENCY-MAP.md).

## Repository layout

```text
project/     Terraform, Ansible, Kubernetes workloads, application and tests
evidence/    Selected sanitised records and their provenance
docs/        Results, limitations, operations and reviewed visual evidence
bedrock/     Local AgentCore and Bedrock implementations and their access status
```

## Reproduce the local checks

```powershell
python -B -m unittest discover -s project/tests -v
terraform -chdir=project/terraform fmt -check -recursive
```

Terraform validation requires initialisation with the required providers; it does not require an AWS deployment. The [recorded local checks](docs/capture/LOCAL-CHECKS.md) distinguish saved results from commands a reader runs now. The [Bedrock companion README](bedrock/local-implementation/README.md) lists its local commands, and the [AgentCore Runtime slice](bedrock/agentcore/README.md) lists its local checks.

The Kubernetes image references use a documented sample account and an explicit digest placeholder. Supply the intended account and immutable ECR image digest before deployment. Cloud deployment requires separate identity, access, cost and cleanup preparation; the source does not authorise a paid run.

## Cost and cleanup

The final Phase 1 session was planned at USD 4–8 with a USD 15 operating allowance. These are planning figures; final charges have not been reconciled and the allowance was not a hard cap. Earlier sessions have separate runtime and costs.

The compute expiry guard terminates tagged instances only. Full cleanup also removes storage, networking and other lab resources, followed by a residual inventory check. The recorded cleanup preserved unrelated resources and the retained Terraform backend. See the [results](docs/RESULTS.md) and [cleanup evidence](evidence/README.md).
