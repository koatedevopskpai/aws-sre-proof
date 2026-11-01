# Runtime excerpts

`runtime-excerpts.json` is a **minimal sanitised summary** derived from private runtime records. It is not a raw export and does not include instance IDs, account IDs, private IPs, kubeconfigs, keys or full logs.

| Section | Private source |
|---|---|
| S0 | `baseline-ready.txt`, `nodes-baseline.json`, `pvc-baseline.txt`, `etcd-baseline.txt` |
| S1 | `worker-observations-2.jsonl`, `observer-summary-2.json` |
| S2 | `server-replacement-result.json`, server member/PVC logs |
| S3 | `upgrade/nodes-before.json`, `upgrade/nodes-after.json`, observer limitation |
| S4 | `rotation/cert-before.txt`, `cert-after.txt`, `live-endpoint-after.txt` |
| S5 | `gitops/result.json` and revision bundles (only commit IDs published) |
| S6 | `s6/check-result.json`, `receipts.json`, `cloudwatch-s6-events.json` |
| S7 | both `destroy-scope-summary.json` files, cleanup inventories and verification report |

Fingerprints are represented by SHA-256 hashes of the captured fingerprint strings; the raw strings and endpoint details remain private. The S5 commit IDs are the lab-local Git revisions, not a public GitHub repository.

## Boundaries

- S1 is the earlier run, not the final run.
- S3 has no continuous-availability measurement.
- S4 is one API leaf, not CA rotation.
- S5 is lab-local Git and does not prove user outage.
- S6 delivered to an in-cluster receiver and CloudWatch Logs, not a human page.
- S7 billing is unreconciled.
- The excerpts are only as good as the private source records; they do not independently authenticate AWS activity.
