# Operations runbook

This is a reference runbook for a future, separately reviewed session. It is not an active deployment instruction. The lab has been destroyed and no session is active.

## Preflight

1. Confirm the AWS identity and account with `aws sts get-caller-identity`; never print credentials.
2. Confirm `us-east-1`, an unused operator `/32`, and the account's On-Demand Standard vCPU quota. The plan is 8 instances / 16 vCPUs before replacement overlap.
3. Confirm the selected RKE2 release assets, Helm chart versions and AMI lookup.
4. Create a fresh session TTL and a new, unique state key. Never reuse the previous key or migration state.
5. Generate the plan into a private directory, export its JSON and run the plan gate:
   `python project/scripts/check_plan.py <private-plan.json>`.
6. Reject any plan that changes unrelated resources, uses the wrong account/region/tag, or exceeds the approved scope.

## Apply and baseline

Use the reviewed binary plan only. Do not use an unattended auto-approve wrapper. After apply:

- verify the TTL schedule and the tagged compute guard exist;
- verify seven Ready nodes, three etcd members, Cilium health, CSI, PVC bind/mount and the application response;
- verify Prometheus targets are scraped and the log/audit destinations are read back;
- record the actual image digest and render the Kubernetes manifests with it before applying.

## Exercises

Run one bounded exercise at a time and capture evidence before continuing:

- worker replacement: cordon/drain, preserve PDBs and storage, replace one EC2 identity, rejoin, verify seven Ready and application checks;
- control-plane replacement: snapshot and token stored privately, replace one non-bootstrap server, verify exactly three healthy etcd members and seven Ready nodes;
- upgrade: verify target assets, upgrade servers one at a time and then workers, check API/etcd/application after each;
- leaf rotation: capture public fingerprints, follow the release-specific stop/rotate/start sequence, verify the direct endpoint and the cluster;
- GitOps: commit known-good A, induce bounded drift, observe self-heal, commit bad readiness B, observe Degraded, Git revert to C and verify Healthy;
- alert/recovery: measure baseline, inject one reversible fault, capture firing and delivery, restore, capture resolved and passing requests.

## Evidence

Use one UTC run ID. Record source hashes, operator/harness, region, baseline/target versions, start/end, exact target, command exit codes, expectation, observation, recovery and cleanup. Keep state, plans, kubeconfigs, keys, tokens, snapshots and raw logs private. Publish only sanitised excerpts with hashes.

## Cleanup

1. Delete the Argo application before deleting workloads/PVCs, so self-heal cannot recreate them.
2. Delete lab workloads and PVCs while CSI is healthy; verify the underlying EBS volumes are removed.
3. Save PV handles for the audit.
4. From the exact Terraform directory and data directory, review an exact-state destroy plan; it must contain only this lab's resources.
5. Apply the reviewed destroy plan; verify managed state is empty.
6. Run an independent inventory across EC2, EBS, snapshots, NAT/NLB/EIP, VPC, security groups, ENIs, Route 53, ECR, S3, CloudWatch, Lambda, Scheduler, SNS/SQS, CloudTrail, IAM, key pairs, budgets and alarms.
7. Preserve explicitly excluded resources: the retained backend and unrelated account resources. Do not release the unrelated Elastic IP.
8. Reconcile billing later; do not treat a delayed zero reading as zero cost.

## Stop conditions

Wrong identity/region/tag/state; insufficient quota; unverified host keys; unexpected existing-resource changes; unsupported release/chart; loss of quorum; missing recovery material; low cleanup margin; or spend approaching the approved allowance. Stop and restore/clean up rather than extending silently.
