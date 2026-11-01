# Limitations and non-claims

This is a bounded synthetic lab. The following limits travel with every result.

## Evidence and run boundaries

- S1 worker replacement is from the **earlier** run `20261031T031410Z-phase1`; the later run `20261031T151734Z-galland` did not repeat it. The first S1 attempt's observer failed at start, so no continuous-availability claim is made for that attempt.
- S3 upgrade has before/after health checks, not a continuous-availability measurement. The external NodePort observer preflight failed.
- S4 rotated one server API leaf. It is **not** CA rotation. The rotation occurred before that server was replaced; do not claim the replacement VM retained the rotated certificate.
- S5 used a private, read-only, in-cluster Git protocol service. It is not GitHub, an authenticated production Git service or a remote publication. A Degraded rollout can leave old replicas serving; it does not prove user outage.
- S6 delivered to an in-cluster receiver and CloudWatch Logs, not to a human page, pager or production alerting service.
- S2 is a single non-bootstrap server replacement. It is not simultaneous quorum loss or regional disaster recovery.
- The probe image scan reported **4 HIGH / 9 MEDIUM / 3 LOW**. No vulnerability-free or production-ready claim.
- Prometheus was single-instance and was relocated during maintenance. No uninterrupted-Prometheus claim.
- Billing is not reconciled. The USD 4–8 estimate and USD 15 allowance are planning figures, not a hard cap or an actual bill. Cost Explorer lag means a zero/pending reading is not proof of zero cost.
- The cleanup audit is a selected summary in this repository. The full private inventory is withheld; this summary does not independently reproduce the account-side audit.

## Scale and scope boundaries

- No production-scale, monthly SLO, zero-downtime, 24/7 on-call or regional disaster-recovery claim.
- This is a synthetic lab. It is not a production system and does not reproduce any real operational environment.
- The results describe how this bounded environment behaved; they are not evidence of sustained operational tenure.

## AgentCore and Bedrock boundaries

- The Bedrock local implementation is code-verified (14/14 tests, TypeScript build) but **not deployed**.
- No live Bedrock invocation, ingestion, retrieval, trace or evaluation was performed, and no AgentCore resource was created for this preparation.
- The local companion uses Bedrock Agents, not AgentCore Runtime. A separate AgentCore Runtime implementation has 10 passing local tests and CDK synthesis; live deployment and invocation remain NOT RUN.
- The selected Nova 2 Lite live path is blocked by a declined quota request in `us-west-2`; this is not a blanket or permanent denial of all Bedrock or AgentCore access. See the [dated access status](../bedrock/ACCESS-STATUS.md). Local results do not establish runtime traces, live evaluations, cost or cloud cleanup behaviour.
