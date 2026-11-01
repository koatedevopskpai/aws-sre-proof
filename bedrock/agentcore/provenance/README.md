# AgentCore local synthesis provenance

`agentcore-template.json` is the CDK-synthesised CloudFormation template for the local AgentCore Runtime slice.

- Command: `npm run synth:agentcore` in `bedrock/local-implementation`
- Result: exit 0
- The container URI is the documented placeholder `123456789012.dkr.ecr.us-west-2.amazonaws.com/galland-agentcore:placeholder`.
- The synthesis was rerun with explicit sample context `account=123456789012` and `region=us-west-2`; no real account identifier or `us-east-1` is present in the template.
- The template is a review artifact, not a deployment record.
- No AWS resource was created and no model was invoked.

The generated `cdk-agentcore.out/` and `build/` directories are excluded from the repository. Re-synthesise before a live session after changing the image digest, tool names or limits.
