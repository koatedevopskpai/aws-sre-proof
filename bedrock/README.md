# AgentCore extension and Bedrock companion

**Status: local implementation verified; live deployment and invocation NOT RUN.** AWS declined the selected Nova 2 Lite quota request in `us-west-2`. The last recorded applied-quota check, on 31 October 2026 at 22:50:24 UTC, showed zero values; that is a dated observation, not a fresh access check. Read the [access status](ACCESS-STATUS.md).

This directory contains two distinct local implementations. Neither is evidence of live AgentCore or Bedrock operation. The separate Phase 1 AWS SRE exercises ran live and are documented in the main evidence index.

## AgentCore Runtime extension

The [Runtime implementation](agentcore/) provides an ARM64 HTTP container, read-only tool contracts, limits on execution and a kill switch. The CDK stack describes its runtime, endpoint and execution permissions. Ten local tests and infrastructure synthesis passed in the recorded checks; no runtime was deployed.

The first proposed live milestone is one authenticated runtime invocation, a real model response, a read-only tool operation, controlled failure/recovery and available logs/traces. Retrieval, Gateway/MCP integration, policy, broader evaluation and runtime comparison remain later milestones. A minimal Runtime invocation would not establish the whole platform.

## Separate Bedrock companion

The [CDK/TypeScript companion](local-implementation/) includes a knowledge base, scoped tool Lambdas, an MCP server, a Step Functions loop and a managed Bedrock Agent. Its 14 local tests and TypeScript build passed. This is **Bedrock Agents, not AgentCore Runtime**; no live deployment, retrieval or model-response evidence is claimed.

## Implementation and status

- [Competency map](COMPETENCY-MAP.md): local code, planned work and live results kept separate.
- [AgentCore Runtime slice](agentcore/): runtime contract, execution bounds, local tests and CDK stack.
- [Bedrock companion](local-implementation/): knowledge base, scoped tools, MCP server and agent loop.
- [Access status](ACCESS-STATUS.md): the dated model-quota observation and the live-run boundary.

## Future live work

The selected model path is blocked. No paid deployment follows automatically from the local implementation. A future session needs verified model access and quotas, reviewed infrastructure/IAM, a current cost estimate, a bounded run window, evidence export and independent cleanup covering AI resources and any retained bootstrap resources.

Prior estimates are planning assumptions, not prices verified today or a spending cap. Local checks do not invoke a live model, create infrastructure or demonstrate cloud cost and cleanup behaviour.
