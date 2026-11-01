# Capture images

Only reviewed, redacted copies are stored here. Untouched originals and their hashes are kept privately outside this repository.

| Public file | What it shows | Redaction |
|---|---|---|
| `redacted/01-ec2-post-cleanup-redacted.png` | Post-cleanup `us-east-1` EC2 table; only the unrelated stopped PulseNotify instance visible | Cropped blank canvas; account/user menu and unrelated instance name/ID blacked out |
| `redacted/02-readme-results-redacted.png` | README measured S0–S7 results | Top 115 px cropped to remove VS Code tabs, breadcrumb/local username and unrelated tab title |
| `redacted/03-claim-ledger-redacted.png` | Top of the claim ledger | Same crop; no content redaction |
| `redacted/04-local-checks-redacted.png` | Local checks report with real test/build results | Same crop; no content redaction |
| `redacted/05-bedrock-local-redacted.png` | Local Bedrock companion and no-live-deployment boundary | Same crop; no content redaction |

See [`MANIFEST.json`](MANIFEST.json) for redacted SHA-256 values, capture times, source-file hashes, captions and limitations. Original hashes and untouched files are retained privately and are not published.

All five captures were taken on 31 October 2026. Later documentation wording changes are recorded per capture in the manifest.

## Boundaries

- The EC2 image proves only what was visible in the regional EC2 table at capture time. It is not a substitute for the independent multi-service cleanup inventory.
- The VS Code images are screenshots of documentation and saved local-check records, not fresh command execution or live cloud evidence.
- The local Bedrock images are code/local-test evidence only. They do not demonstrate live Bedrock or AgentCore.
- No live Kubernetes, Argo CD or Prometheus console capture exists after teardown.
