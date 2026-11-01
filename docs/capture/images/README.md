# Capture images

Only reviewed, redacted copies are stored here. Untouched originals and their hashes are kept privately outside this repository.

| Public file | What it shows | Redaction |
|---|---|---|
| `redacted/01-ec2-post-cleanup-redacted.png` | Post-cleanup `us-east-1` EC2 table; only the unrelated stopped PulseNotify instance visible | Cropped blank canvas; account/user menu and unrelated instance name/ID blacked out |
| `redacted/04-local-checks-redacted.png` | Local checks report with real test/build results | Top 115 px cropped to remove VS Code tabs, breadcrumb/local username and unrelated tab title |

See [`MANIFEST.json`](MANIFEST.json) for redacted SHA-256 values, capture times, source-file hashes, captions and limitations. Original hashes and untouched files are retained privately and are not published.

Both captures were taken on 31 October 2026. Three further local captures were withdrawn on 1 November 2026 because they showed the former project name or a planning document that is no longer published; they are recorded in the manifest and retained privately.

## Boundaries

- The EC2 image proves only what was visible in the regional EC2 table at capture time. It is not a substitute for the independent multi-service cleanup inventory.
- The local-checks image is a screenshot of a saved documentation record, not fresh command execution or live cloud evidence.
- No live Kubernetes, Argo CD or Prometheus console capture exists after teardown.
