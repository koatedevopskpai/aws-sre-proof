# Galland AWS SRE evidence — final session results

31 October 2026. Run `20261031T151734Z-galland`, us-east-1. Independent synthetic lab; no commercial production or on-call-tenure claim.

| Exercise | Observed result |
|---|---|
| Baseline | 96 resources applied; seven Ready RKE2 nodes; CSI, storage, application and monitoring verified |
| Worker replacement | Earlier run: 600/600 accepted requests over ten minutes, one client at 1 req/s; p95 48.598 ms. First attempt's observer failed; no availability claim for that attempt |
| Control-plane replacement | One non-bootstrap server replaced by distinct EC2 identity; old instance terminated; three healthy etcd endpoints, seven Ready nodes, same PVC UIDs; synthetic marker count 2 before/after |
| Patch upgrade | All seven nodes Ready on v1.36.5+rke2r1 from v1.36.4+rke2r1; API/etcd and post-upgrade application checks passed |
| API leaf rotation | One server's certificate fingerprint changed and matched its directly verified live endpoint; CA/IP verification passed. No CA rotation |
| GitOps | Argo CD synced revision A, healed replica drift, observed readiness-regressed B as Degraded, then synced a Git revert to Healthy. Read-only lab-local Git protocol source; no GitHub push. Original HTTP transport failed and was replaced; a hard refresh cleared a transient source-rollout lookup error |
| Alert/recovery | 180/180 baseline accepted; 228 failures among 240 fault-window requests; 300/300 recovery accepted. Same-run firing/resolved receiver receipts and two matching CloudWatch log events read back |
| Cleanup | 96 managed resources destroyed; empty managed state; independent inventory passed; unrelated stopped server/EIP and retained backend preserved |

## Evidence and limits

Raw records, source hashes, exact identities, Git revision bundles, fingerprints, API receipts and genuine EC2 console screenshots are retained privately. Source paths and hashes are indexed there. No fabricated console captures. The excerpts included in this repository passed a separate redaction and manifest review; the raw records remain private.

The upgrade's external NodePort observer preflight failed, so it has before/after health checks, not a continuous-availability claim. The failed attempts and operational fixes are retained: Ansible role path, explicit lab emptyDir cache-loss opt-in, changed operator /32 and Git transport/cache recovery. PDB eviction protections were not disabled.

Argo's source and anonymous read-only UI were private to the lab; source authentication/TLS and external Git hosting were not demonstrated. The unhealthy rollout could leave old replicas serving; Degraded does not prove user outage. Alerts reached an in-cluster receiver and CloudWatch Logs, not a human page. The control-plane exercise is not simultaneous quorum loss or regional DR.

The probe image scan still reported 4 HIGH / 9 MEDIUM / 3 LOW. No production-ready or vulnerability-free claim. Prometheus was single-instance. Billing has not reconciled: USD 4–8 was an estimate, USD 15 an operating allowance, not a hard cap. Phase 2A is local-only; live AgentCore remains NOT RUN.
