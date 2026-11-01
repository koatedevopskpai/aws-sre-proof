# Local checks — real captured output

Run on **31 October 2026** against pre-publication revision `3a649e87c8ad705f8db4fa644aaca080ae7484e1`. The working tree was clean before and after the checks. That revision predates the cleaned public history and is recorded here only as the observed source state.

This is a summary of real local runs. The full stdout/stderr logs are retained privately outside this repository; this page is not a replay and does not claim a live AWS or Bedrock run.

| Check | Command | Result | Exit code |
|---|---|---|---|
| AWS SRE tests | `python -B -m unittest discover -s project/tests -v` | 13 tests passed | 0 |
| Terraform formatting | `terraform -chdir=project/terraform fmt -check -recursive` | no formatting changes needed | 0 |
| Terraform validation | `terraform -chdir=<disposable-copy> validate -no-color` | configuration valid | 0 |
| Local Bedrock tests | `npm test` in `bedrock/local-implementation` | 14 passed, 0 failed | 0 |
| Local Bedrock build | `npm run build` in `bedrock/local-implementation` | TypeScript build passed | 0 |

## Captured excerpts

```text
project-tests:
Ran 13 tests in 2.186s
OK
EXIT_CODE=0
UTC_END=2026-10-31T20:07:35.7727576Z
```

```text
terraform-validate:
Success! The configuration is valid.
EXIT_CODE=0
UTC_END=2026-10-31T20:08:52.2936366Z
```

```text
bedrock-tests:
tests 14
pass 14
fail 0
EXIT_CODE=0
UTC_END=2026-10-31T20:07:48.9835993Z
```

```text
bedrock-build:
> tsc
EXIT_CODE=0
```

## Source state

```text
UTC=2026-10-31T20:07:33.0450426Z
COMMIT=3a649e87c8ad705f8db4fa644aaca080ae7484e1
STATUS_START

STATUS_END
```

The same revision and an empty `git status --porcelain` were observed after the checks. The repository history was later rebuilt to remove private identifiers, so the revision above is a historical, pre-publication identifier rather than a commit a reader can check out.

## Not run

- Live AWS Terraform plan/apply/destroy.
- Live Bedrock or AgentCore invocation.
- Kubernetes/Argo CD/Prometheus runtime checks.
- Container image build or vulnerability rescan.
- Any cloud cost or billing query.

Terraform validation used a disposable copy and the provider cache already present on the workstation. It did not contact AWS or change the repository.
