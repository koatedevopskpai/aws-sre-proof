# AgentCore Runtime — local implementation

**Status: local preparation only. No AgentCore Runtime or paid resource has been deployed. Live results are NOT RUN.**

This is the first AgentCore slice: one ARM64 container, one HTTP AgentCore Runtime, one endpoint and one read-only tool path. It is intentionally narrower in scope than the wider extension described in the [parent README](../README.md).

## Runtime contract

- Container listens on `0.0.0.0:8080`.
- `POST /invocations` with `{"prompt": "..."}`.
- `GET /ping` returns `{"status":"Healthy"}`.
- ARM64 container required by AgentCore Runtime.
- No commit, approval or mutation endpoint exists in this container.

## Agent behaviour and bounds

The model may call only:

- `query_incidents` — read-only synthetic incident query.
- `read_s3_doc` — read-only approved document read.
- `get_cluster_status` — synthetic mock status.

Bounds are environment-driven:

| Limit | Default |
|---|---|
| Turns | 4 |
| Tool calls | 6 |
| Model calls | 4 |
| Prompt characters | 4,000 |
| Output tokens | 512 |
| Runtime seconds | 60 |
| Concurrent invocations | 2 |

`AGENT_ENABLED=false` disables new invocations while the process still answers `/ping`. `/invocations` returns HTTP 503 when disabled. Concurrency saturation returns HTTP 429; invalid input returns HTTP 400; limit breaches return HTTP 422.

## Layout

```text
agent/app.py           Runtime HTTP server, loop, limits and tool allow-list
agent/tests/           Offline contract/error/bounds tests
Dockerfile             ARM64 runtime container
scripts/build_and_push.sh
scripts/invoke.py
scripts/export_evidence.py
scripts/cleanup_inventory.py
```

The CDK stack is in `../local-implementation/lib/agentcore-runtime-stack.ts` and the app entrypoint is `../local-implementation/bin/agentcore-runtime.ts`.

## Local checks

```powershell
python -B -m unittest discover -s bedrock/agentcore/tests -v
cd bedrock/local-implementation
npm run build
npm run synth:agentcore
```

`npm run synth:agentcore` uses the placeholder container URI. It is a template synthesis, not an image build or deployment.

## Live deployment outline — requires a separate, reviewed session

1. Verify model access and positive quotas in `us-west-2`.
2. Build and push the ARM64 image with `build_and_push.sh --yes --create-repo` (record the digest).
3. Bootstrap CDK in the target account/region if needed.
4. Review the synthesised stack and IAM policy.
5. Deploy with the reviewed image digest and existing read-only tool function names.
6. Invoke once with `invoke.py`; export logs/traces with `export_evidence.py`.
7. Disable invocation, delete the stack, and run `cleanup_inventory.py` before and after.

## Security boundary

- The runtime execution role can invoke only the named tool functions and Bedrock models.
- Tool names are allow-listed in code; the model cannot supply a function ARN.
- All tools are read-only; no infrastructure, IAM, billing or money mutation.
- The initial slice uses `NetworkMode: PUBLIC` for the managed runtime. VPC/private networking is deferred and must be reviewed separately.
- No secrets are stored in code or environment variables.

## Current blocker

Live deployment is blocked by the selected model quota; see [`../ACCESS-STATUS.md`](../ACCESS-STATUS.md). The local contract, tests and template synthesis are recorded in this directory.
