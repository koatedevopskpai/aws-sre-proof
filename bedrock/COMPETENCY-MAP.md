# Bedrock competency map

This map prevents local code and design work being mistaken for live delivery.

| Competency | Artifact | Status |
|---|---|---|
| Bedrock CDK infrastructure | `local-implementation/lib/agentic-ai-platform-stack.ts` | LOCAL VERIFIED (build + synth manifest) |
| Bedrock knowledge base / retrieval design | CDK stack, fixtures, local tests | LOCAL CODE ONLY |
| Bedrock model invocation | Local mock/tests; no live invocation | NOT RUN LIVE |
| Scoped tool Lambdas | `local-implementation/lambda/` | LOCAL VERIFIED (14 tests) |
| MCP server | `local-implementation/mcp-server/` | LOCAL VERIFIED (code); not hosted |
| Step Functions agent loop | `local-implementation/lib/` + tests | LOCAL VERIFIED (code); not deployed |
| Managed Bedrock Agent | CDK stack | LOCAL SYNTH ONLY; not deployed |
| AgentCore Runtime contract | `agentcore/agent/app.py`; 10 local tests | LOCAL VERIFIED; live NOT RUN |
| AgentCore CDK runtime/endpoint/IAM | `local-implementation/lib/agentcore-runtime-stack.ts`; synthesis | LOCAL SYNTH VERIFIED; not deployed |
| AgentCore bounds and kill switch | `agentcore/tests/` | LOCAL VERIFIED; live NOT RUN |
| AgentCore Gateway and policy | Not implemented | NOT RUN |
| Typed deterministic decision layer | Not implemented | NOT RUN |
| Human approval / four-eyes control | Not implemented | NOT RUN |
| AgentCore evaluation gate | Not implemented | NOT RUN |
| Bedrock/AgentCore X-Ray traces | Not implemented | NOT RUN |
| Cost, TTL and cleanup for AI resources | Not implemented | NOT RUN |
| AWS SRE / RKE2 lifecycle | This repository's S0–S7 evidence | DEMONSTRATED |

## What is verified

- The SRE side has measured lifecycle, observability, fault/recovery and cleanup evidence.
- The local Bedrock companion has a real CDK stack, scoped tools, an MCP server and a tested agent loop.
- The AgentCore runtime slice has explicit execution bounds, a read-only allow-list and a kill switch, with local tests for each.

## What is missing

- Any live Bedrock invocation, ingestion, deployment or AgentCore runtime.
- Live retrieval, citation and refusal evidence.
- AgentCore traces, evaluations or tool-policy denials.
- Human approval and idempotency tests against cloud state.
- AI resource cleanup and cost evidence.

The local implementation converts some rows from "design" to "code verified". It does **not** convert them to "demonstrated live". A future live session must do that with runtime evidence.
