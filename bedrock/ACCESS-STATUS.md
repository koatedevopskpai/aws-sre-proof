# AgentCore live demonstration: model quota blocker

Status recorded on 1 November 2026 from AWS Support correspondence supplied by the project owner. No fresh AWS queries were performed for this documentation update.

AWS declined this account's request for 8,000,000 cross-region inference tokens per minute for Amazon Nova 2 Lite (`L-C6F5908D`) in `us-west-2`. AWS stated it could not approve the request at that time and that access eligibility may change. This blocks the selected model-backed AgentCore demonstration; it is not evidence of permanent denial, denial of all models or regions, or denial of AgentCore Runtime hosting itself.

The last recorded applied-quota check was **31 October 2026 at 22:50:24 UTC**. Nova TPM, RPM and daily-token values were zero. Those are historical observations, not a fresh check or an inference from the denial. No approval date is promised.

## What is supported

- AgentCore Runtime code and read-only tool contracts are implemented locally.
- Ten local tests and CDK synthesis passed in the recorded checks.
- The separate Bedrock companion has 14 passing local tests and a passing TypeScript build.

## What remains untested live

No AgentCore runtime was deployed for this demonstration. Authenticated runtime invocation, model responses, live tool execution, cloud observability and live evaluations remain NOT RUN. Local tests and template synthesis do not establish those results.

The Phase 1 AWS RKE2 reliability exercises were a separate paid live lab, with measured results and verified cleanup. Their evidence is unaffected by this model quota decision.

## Next steps

Any future live experiment must first establish an available model path, review infrastructure and permissions, and agree a bounded cost/time window and cleanup owner. Alternative models or regions require verification; changing region is not a guaranteed solution. No automatic quota resubmission or deployment is planned.

See the [AgentCore Runtime slice](agentcore/README.md) and the [competency map](COMPETENCY-MAP.md). Private support correspondence and account/case identifiers are not included.
