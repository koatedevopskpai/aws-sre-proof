# Local Bedrock companion

**Status: local-only. No live Bedrock or AgentCore deployment. No cloud evidence.**

This is a separate Bedrock implementation, included to show code-level competency alongside the measured AWS SRE lab. It is not part of the AWS SRE run and must not be presented as live Bedrock delivery.

## What it contains

- AWS CDK (TypeScript) stack for an S3 document bucket and a DynamoDB incidents table.
- A Bedrock knowledge base over synthetic documents, using Titan embeddings and an OpenSearch Serverless vector store.
- Three scoped tool Lambdas: `query_incidents`, `read_s3_doc` and `get_cluster_status` (stub).
- An API Gateway `POST /ask` RAG endpoint using the Bedrock Converse API.
- A hand-rolled `plan → act → observe` Step Functions agent loop with an iteration cap.
- A managed Bedrock Agent and alias using the same knowledge base and tools.
- A shared MCP server exposed over stdio locally and as an IAM-authenticated Lambda Function URL.
- Offline tests for the runner, cleanup gates, smoke gates, tool dispatch, UTF-8 handling and the MCP/agent contracts.

This is **Bedrock Agents**, not AgentCore Runtime. AgentCore, Gateway, Policy, evaluations and X-Ray tracing for the agent are separate work and are not implemented in this companion.

## Verified locally

- `npm test`: **14/14 pass** on 31 October 2026.
- `npm run build`: TypeScript build passes.
- Latest recorded local synthesis: `20261029T035419Z`, status `LOCAL_CHECKS_PASSED`, mode `local-only`; see [`provenance/run-20261029T035419Z.json`](provenance/run-20261029T035419Z.json).

The local evidence is not a live Bedrock invocation, retrieval result, trace or deployment. It does not prove cloud behaviour.

## Why it was not deployed

The local build was not deployed. The recorded checks showed zero on-demand token quotas for the tested models, and the selected Bedrock model request was subsequently declined. See [`../ACCESS-STATUS.md`](../ACCESS-STATUS.md). No CDK bootstrap or lab stack was created. Do not claim a live Bedrock deployment from this folder.

## Local checks

```powershell
npm ci
npm test
npm run build
```

`npm run synth` and any deployment require CDK bootstrap, verified Bedrock model access, an agreed cost and time window, and a teardown plan. None of those are provided by this repository.

## Boundaries

- Synthetic documents and fixtures only; no customer data.
- No credentials, private keys, state or account-specific configuration are included.
- The OpenSearch Serverless vector store has a minimum OCU cost if deployed; the lab must be destroyed after a session.
- The stack is a local reference, not a production architecture or a security certification.
