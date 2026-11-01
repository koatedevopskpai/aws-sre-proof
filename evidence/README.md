# Evidence index

This directory contains selected, sanitised evidence. It is not the full private run record. Raw keys, kubeconfigs, Terraform state/plans, full inventories, node logs and trace exports remain private.

| Path | Supports | Notes |
|---|---|---|
| `worker-replacement/observations.jsonl` | S1 | 600 synthetic observations, no resource identities |
| `worker-replacement/summary.json` | S1 | Recalculated bounded-window summary |
| `worker-replacement/observe_http.py` | S1 | Observer source; later fixes may differ from the measured build |
| `worker-replacement/drain-started.txt` | S1 | Original UTC checkpoint |
| `worker-replacement/replacement-ready.txt` | S1 | Original UTC checkpoint |
| `cleanup/summary.json` | S7 | Selected cleanup summary; not a full cloud inventory |
| `audit/secret-denial-summary.json` | S6/security | Selected metadata readback, not a raw audit export |
| `audit/audit-policy.yaml.j2` | Security | Current policy source, including Metadata level for Secrets |
| `final/session-results.json` | S0–S7 | Final run statuses, without private paths |

## Claim-to-evidence

- S1: `worker-replacement/observations.jsonl` and `worker-replacement/summary.json`; the 600-row file is the source of the 600/600 and p95 48.598 ms figures.
- S6: `final/session-results.json` plus `audit/secret-denial-summary.json` for the security path. The alert receiver and CloudWatch readback are summarised; raw receipts remain private.
- S7: `cleanup/summary.json` and `final/session-results.json`; the independent inventory is summarised, not reproduced.
- S0, S2, S3, S4, S5: `final/session-results.json` and `docs/RESULTS.md`. Raw traces, snapshots, fingerprints and Git bundles remain private.

## Runtime excerpts

[`runtime-excerpts/runtime-excerpts.json`](runtime-excerpts/runtime-excerpts.json) is a minimal sanitised summary derived from the private runtime records: S0 baseline, S1 earlier worker window, S2 server replacement, S3 upgrade, S4 leaf rotation, S5 GitOps revisions, S6 alert/recovery and both S7 cleanup runs. It omits instance/account identifiers and raw logs. The private originals remain outside the repository.

## Visual evidence

Reviewed, redacted screenshots are indexed separately in [`../docs/capture/images/MANIFEST.json`](../docs/capture/images/MANIFEST.json).

| Image | Supports | Limit |
|---|---|---|
| `docs/capture/images/redacted/01-ec2-post-cleanup-redacted.png` | S7 visible EC2 cleanup | Regional table only; not the multi-service inventory |
| `docs/capture/images/redacted/04-local-checks-redacted.png` | Local test/build results | Retrospective report, not a live run |

Three further documentation captures were withdrawn on 1 November 2026 because they showed the former project name or a planning document that is no longer published. The manifest records the withdrawal; the files are retained privately.

Untouched originals remain private. The EC2 account/user menu and unrelated instance identifiers were removed from the public copy; local VS Code chrome, local username path and an unrelated tab title were cropped from the local-check image.

## Integrity

`PROVENANCE.json` records the SHA-256 of each file in this directory and the source label. It is a local integrity record, not an external attestation of AWS activity. The observer samples are byte-identical to the verified public-review source.

## Boundaries

- The 600-request window is ten minutes, one client, one request per second. It is not a monthly SLO or a production load test.
- The cleanup summary is selected; it does not let a reader independently reproduce the private AWS inventory.
- The audit summary covers one observed denied read. It is not a complete security-event correlation or a SIEM claim.
- The final run's S2–S6 results are summarised from private evidence that is not included here.
