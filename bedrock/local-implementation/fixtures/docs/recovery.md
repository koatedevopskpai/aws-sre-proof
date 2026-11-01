# Synthetic platform recovery procedure

This is a fictional portfolio lab document, not an operational customer runbook.

For an API latency incident, first identify the affected release. Roll back to the last healthy release,
verify that the health endpoint returns HTTP 200, and check that p95 latency stays below 300 milliseconds
for ten minutes. Record the incident and the recovery evidence before closing it.

