'use strict';
// Windows/Linux runner. No cloud mutation in --check; live runs always attempt cleanup.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { SignatureV4 } = require('@smithy/signature-v4');
const { Sha256, ingestionComplete, agentSucceeded, ragHasCitations, pollTerminal } = require('./lab-support.cjs');
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
const STACK = 'AgenticAiPlatformStack';
const region = process.env.AWS_REGION || 'eu-west-2';
const env = { ...process.env, AWS_REGION: region, AWS_DEFAULT_REGION: region, CDK_DEFAULT_REGION: region, AWS_PAGER: '' };
let evidence, manifest;
let deadline = Date.now() + 30 * 60_000;
function remaining(maximum) {
  const ms = Math.min(maximum, deadline - Date.now());
  assert.ok(ms > 0, 'Run deadline exceeded');
  return ms;
}
function save(name, value) {
  fs.writeFileSync(path.join(evidence, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
function command(exe, args, options = {}) {
  const r = spawnSync(exe, args, { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: remaining(90_000), ...options });
  if (r.error || r.status !== 0) throw new Error(`${path.basename(exe)} ${args[0]} failed: ${r.error?.message || r.stderr || r.stdout}`);
  return r.stdout;
}
function aws(args, targetRegion = region) {
  const text = command('aws', [...args, '--region', targetRegion, '--output', 'json', '--cli-connect-timeout', '10', '--cli-read-timeout', '30']);
  return text.trim() ? JSON.parse(text) : {};
}
function cdk(args, log) {
  const r = spawnSync(process.execPath, [require.resolve('aws-cdk/bin/cdk'), ...args], {
    cwd: ROOT, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: remaining(20 * 60_000),
  });
  if (log) save(log, `${r.stdout || ''}\n${r.stderr || ''}`);
  if (r.error || r.status !== 0) throw new Error(`CDK ${args[0]} failed; see ${log || 'output'}: ${r.error?.message || r.stderr}`);
  return r.stdout;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, status, max, interval) {
  for (let n = 0; n < max; n++) {
    const value = read();
    if (pollTerminal(status(value))) return value;
    await wait(remaining(interval));
  }
  throw new Error('Polling deadline exceeded');
}
async function post(apiUrl, route, body) {
  // Credentials remain in process memory, never in evidence or command arguments.
  const raw = JSON.parse(command('aws', ['configure', 'export-credentials', '--format', 'process']));
  const credentials = { accessKeyId: raw.AccessKeyId, secretAccessKey: raw.SecretAccessKey, sessionToken: raw.SessionToken };
  const url = new URL(route.replace(/^\//, ''), apiUrl);
  const signer = new SignatureV4({ credentials, region, service: 'execute-api', sha256: Sha256 });
  const signed = await signer.sign({ protocol: url.protocol, hostname: url.hostname, method: 'POST',
    path: url.pathname, query: {}, headers: { host: url.host, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const start = performance.now();
  const response = await fetch(url, { method: 'POST', headers: signed.headers, body: signed.body, signal: AbortSignal.timeout(remaining(30_000)) });
  const text = await response.text();
  assert.ok(response.ok, `${route}: HTTP ${response.status}: ${text.slice(0, 500)}`);
  return { data: JSON.parse(text), seconds: (performance.now() - start) / 1000 };
}
async function destroy() {
  // Cleanup has a separate deadline even if deployment exhausted the run budget.
  deadline = Date.now() + 25 * 60_000;
  // Only called for the newly-created lab stack, or an explicit matching evidence manifest.
  let before, live;
  try { live = aws(['cloudformation', 'describe-stacks', '--stack-name', STACK]).Stacks[0]; }
  catch (e) {
    if (!/does not exist/i.test(e.message)) throw e;
  }
  if (live) {
    if (manifest.stackId) assert.equal(live.StackId, manifest.stackId, 'Stack replaced; refusing deletion');
    else assert.ok(live.Tags?.some(tag => tag.Key === 'LabRunId' && tag.Value === manifest.runId), 'Stack ownership not established');
    manifest.stackId = live.StackId; save('manifest.json', manifest);
    before = aws(['cloudformation', 'list-stack-resources', '--stack-name', live.StackId]);
  } else {
    const stored = ['resources-before-teardown.json', 'stack-resources.json'].find(name => fs.existsSync(path.join(evidence, name)));
    assert.ok(stored, 'Stack absent but no resource inventory exists; residual verification cannot be claimed');
    before = JSON.parse(fs.readFileSync(path.join(evidence, stored), 'utf8'));
  }
  save('resources-before-teardown.json', before);
  if (live && live.StackStatus !== 'DELETE_COMPLETE') {
    aws(['cloudformation', 'delete-stack', '--stack-name', live.StackId]);
    const deleted = await poll(() => {
      const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', live.StackId]).Stacks[0];
      return { ...stack, status: stack.StackStatus === 'DELETE_IN_PROGRESS' ? 'IN_PROGRESS' : stack.StackStatus };
    }, x => x.status, 140, 10_000);
    save('destroy.json', deleted);
    assert.equal(deleted.StackStatus, 'DELETE_COMPLETE', 'CloudFormation deletion failed');
  }
  const residuals = [];
  try {
    const s = aws(['cloudformation', 'describe-stacks', '--stack-name', STACK]).Stacks[0];
    if (s.StackStatus !== 'DELETE_COMPLETE') residuals.push({ stack: s.StackStatus });
  } catch (e) {
    if (!/does not exist/i.test(e.message)) throw e;
  }
  const checks = {
    'AWS::S3::Bucket': id => ['s3api', 'head-bucket', '--bucket', id],
    'AWS::DynamoDB::Table': id => ['dynamodb', 'describe-table', '--table-name', id],
    'AWS::Lambda::Function': id => ['lambda', 'get-function-configuration', '--function-name', id],
    'AWS::Bedrock::KnowledgeBase': id => ['bedrock-agent', 'get-knowledge-base', '--knowledge-base-id', id],
    'AWS::Bedrock::Agent': id => ['bedrock-agent', 'get-agent', '--agent-id', id],
    'AWS::ApiGateway::RestApi': id => ['apigateway', 'get-rest-api', '--rest-api-id', id],
  };
  for (const resource of before.StackResourceSummaries) {
    const id = resource.PhysicalResourceId;
    const check = checks[resource.ResourceType];
    if (id && check) {
      try { aws(check(id)); residuals.push({ type: resource.ResourceType, id }); }
      catch (e) { if (!/ResourceNotFoundException|NotFoundException|\(404\)|NoSuchBucket/i.test(e.message)) throw e; }
    }
    if (id && resource.ResourceType === 'AWS::OpenSearchServerless::Collection') {
      const data = aws(['opensearchserverless', 'batch-get-collection', '--ids', id]);
      if (data.collectionDetails?.length) residuals.push({ type: resource.ResourceType, id });
      if (data.collectionErrorDetails?.some(e => e.errorCode !== 'NOT_FOUND')) throw new Error(JSON.stringify(data.collectionErrorDetails));
    }
    if (id && resource.ResourceType === 'AWS::Lambda::Function') {
      try { command('aws', ['logs', 'delete-log-group', '--log-group-name', `/aws/lambda/${id}`, '--region', region]); }
      catch (e) { if (!/ResourceNotFoundException/i.test(e.message)) throw e; }
    }
  }
  save('residual-checks.json', { checkedAt: new Date().toISOString(), residuals,
    scope: 'Stack deletion plus exact lab storage, API, Lambda, KB, agent and collection IDs; bootstrap assets excluded.' });
  assert.equal(residuals.length, 0, 'Lab resources remain after teardown');
}
async function main() {
  if (process.argv.includes('--teardown')) {
    const supplied = process.argv[process.argv.indexOf('--teardown') + 1];
    assert.ok(supplied, '--teardown requires the original evidence directory');
    evidence = path.resolve(supplied);
    manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'manifest.json')));
    assert.equal(manifest.region, region, 'Teardown region mismatch');
    const identity = aws(['sts', 'get-caller-identity']);
    assert.equal(identity.Account, manifest.account, 'Teardown account mismatch');
    assert.ok(manifest.stackId, 'Original stack ID missing; inspect manually before teardown');
    await destroy(); manifest.teardown = 'VERIFIED'; save('manifest.json', manifest); return;
  }
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  evidence = path.join(ROOT, 'evidence', timestamp);
  fs.mkdirSync(evidence, { recursive: true });
  console.log(`Evidence: ${evidence}`);
  // Resolve the live account before synthesising so saved and deployed templates agree.
  const localOnly = process.argv.includes('--check');
  let identity;
  if (!localOnly) {
    assert.match(process.env.EXPECTED_AWS_ACCOUNT || '', /^\d{12}$/, 'Set EXPECTED_AWS_ACCOUNT explicitly');
    assert.ok(Number.isFinite(Number(env.MAX_SPEND_USD)) && Number(env.MAX_SPEND_USD) > 0, 'Set finite positive MAX_SPEND_USD');
    identity = aws(['sts', 'get-caller-identity']);
    assert.equal(identity.Account, process.env.EXPECTED_AWS_ACCOUNT, 'AWS account mismatch');
    assert.ok(!identity.Arn.endsWith(':root'), 'Use a deployment identity, not root');
    env.CDK_DEFAULT_ACCOUNT = identity.Account;
  }
  command(process.execPath, [require.resolve('typescript/bin/tsc')]);
  cdk(['synth', STACK, '--quiet', '-c', 'autoDestroyMinutes=60'], 'synth.log');
  const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'cdk.out', `${STACK}.template.json`), 'utf8'));
  save('synth.json', template);
  manifest = { runId: timestamp, startedAt: new Date().toISOString(), region,
    mode: process.argv.includes('--check') ? 'local-only' : 'live', status: 'LOCAL_CHECKS_PASSED',
    humanReview: 'PENDING: inspect recovery answer against fixture and out-of-context refusal',
    modelId: env.MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    agentModelId: env.AGENT_MODEL_ID || 'deepseek.v3.2' };
  manifest.sourceHashes = Object.fromEntries([
    'lib/agentic-ai-platform-stack.ts', 'lambda/agent-plan/index.ts', 'lambda/agent-act/index.ts',
    'scripts/lab-run.cjs', 'scripts/lab-support.cjs', 'package-lock.json',
  ].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex')]));
  save('manifest.json', manifest);
  if (process.argv.includes('--check')) { console.log('Local build and synth passed. No AWS deployment attempted.'); return; }
  assert.match(process.env.EXPECTED_AWS_ACCOUNT || '', /^\d{12}$/, 'Set EXPECTED_AWS_ACCOUNT explicitly');
  assert.ok(Number(process.env.MAX_SPEND_USD) > 0, 'Set the user-authorised MAX_SPEND_USD (planning limit, not a hard billing cap)');
  const docs = path.resolve(process.env.DOCS_DIR || path.join(ROOT, 'fixtures', 'docs'));
  assert.ok(fs.existsSync(docs) && fs.readdirSync(docs).length, 'Missing/empty docs directory');
  manifest.account = identity.Account; manifest.callerArn = identity.Arn;
  manifest.authorisedPlanningLimitUsd = Number(process.env.MAX_SPEND_USD);
  manifest.docsDirectory = docs;
  save('manifest.json', manifest);
  // Refuse existing stacks before even spending tokens on a model preflight.
  try {
    aws(['cloudformation', 'describe-stacks', '--stack-name', STACK]);
    throw new Error('Existing stack found; refusing deployment and automatic deletion');
  } catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  // Availability metadata alone did not expose account quota/onboarding blocks in the initial review.
  // Check real bounded invocation before creating persistent paid resources.
  for (const modelId of new Set([manifest.modelId, manifest.agentModelId])) {
    const result = aws(['bedrock-runtime', 'converse', '--model-id', modelId,
      '--messages', JSON.stringify([{ role: 'user', content: [{ text: 'Reply OK.' }] }]),
      '--inference-config', JSON.stringify({ maxTokens: 8, temperature: 0 })]);
    save(`model-preflight-${modelId.replace(/[^a-zA-Z0-9-]/g, '_')}.json`, {
      modelId, usage: result.usage, stopReason: result.stopReason,
      limitation: 'Invocation check only; does not establish managed-agent or tool-use compatibility.',
    });
  }
  const toolProbe = aws(['bedrock-runtime', 'converse', '--model-id', manifest.modelId,
    '--messages', JSON.stringify([{ role: 'user', content: [{ text: 'Call verify_ready with ready=true.' }] }]),
    '--tool-config', JSON.stringify({ tools: [{ toolSpec: { name: 'verify_ready', description: 'Verify readiness',
      inputSchema: { json: { type: 'object', properties: { ready: { type: 'boolean' } }, required: ['ready'] } } } }] }),
    '--inference-config', JSON.stringify({ maxTokens: 96, temperature: 0 })]);
  save('tool-preflight.json', toolProbe);
  assert.ok(toolProbe.output?.message?.content?.some(block => block.toolUse?.name === 'verify_ready'), 'Model did not demonstrate Converse tool use');
  // Refuse to modify an existing stack: cleanup must never destroy someone else's deployment.
  try {
    aws(['cloudformation', 'describe-stacks', '--stack-name', STACK]);
    throw new Error('Existing stack found; refusing deployment and automatic deletion');
  } catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  let attempted = false;
  try {
    attempted = true;
    cdk(['deploy', STACK, '--require-approval', 'never', '--outputs-file', path.join(evidence, 'cdk-outputs.json'),
      '--app', 'cdk.out', '--tags', `LabRunId=${manifest.runId}`], 'deploy.log');
    const outputs = JSON.parse(fs.readFileSync(path.join(evidence, 'cdk-outputs.json')))[STACK];
    manifest.stackId = aws(['cloudformation', 'describe-stacks', '--stack-name', STACK]).Stacks[0].StackId;
    manifest.outputs = outputs; save('manifest.json', manifest);
    save('stack-resources.json', aws(['cloudformation', 'list-stack-resources', '--stack-name', STACK]));
    for (const [n, severity] of [[1, 'P1'], [2, 'P1'], [3, 'P2']]) {
      aws(['dynamodb', 'put-item', '--table-name', outputs.IncidentsTableName, '--item', JSON.stringify({
        id: { S: `inc-${n}` }, createdAt: { S: `2026-10-25T${String(8 + n).padStart(2, '0')}:00:00Z` },
        severity: { S: severity }, summary: { S: 'Synthetic lab incident' },
      })]);
    }
    command('aws', ['s3', 'sync', docs, `s3://${outputs.DocsBucketName}/docs/`, '--region', region]);
    const jobId = aws(['bedrock-agent', 'start-ingestion-job', '--knowledge-base-id', outputs.KnowledgeBaseId,
      '--data-source-id', outputs.DataSourceId]).ingestionJob.ingestionJobId;
    const job = await poll(() => aws(['bedrock-agent', 'get-ingestion-job', '--knowledge-base-id', outputs.KnowledgeBaseId,
      '--data-source-id', outputs.DataSourceId, '--ingestion-job-id', jobId]).ingestionJob, x => x.status, 60, 10000);
    save('ingestion.json', job); ingestionComplete(job);
    const recovery = await post(outputs.ApiUrl, '/ask', { question: 'What is the recovery procedure?' });
    save('ask-recovery.json', recovery.data); ragHasCitations(recovery.data);
    const unrelated = await post(outputs.ApiUrl, '/ask', { question: 'What is the capital of Mars?' });
    save('ask-out-of-docs.json', unrelated.data);
    assert.ok(unrelated.data.answer?.trim(), 'Out-of-context answer empty; human refusal review still required');
    const start = performance.now();
    const submitted = await post(outputs.ApiUrl, '/agent', { question: 'How many P1 incidents are there, and when was the latest?' });
    assert.ok(submitted.data.executionArn, 'Agent did not return an execution ARN');
    const execution = await poll(() => aws(['stepfunctions', 'describe-execution', '--execution-arn', submitted.data.executionArn]), x => x.status, 65, 5000);
    const agentSeconds = (performance.now() - start) / 1000;
    save('agent-execution.json', execution);
    save('agent-execution-history.json', aws(['stepfunctions', 'get-execution-history', '--execution-arn', submitted.data.executionArn]));
    const answer = agentSucceeded(execution);
    assert.ok(answer.iterations > 0, 'Agent did not use a tool');
    const managedStart = performance.now();
    const managed = await post(outputs.ApiUrl, '/agent-core', { question: 'How many P1 incidents are there?' });
    assert.ok(managed.data.executionArn, 'Managed agent did not return an execution ARN');
    const managedExecution = await poll(() => aws(['stepfunctions', 'describe-execution', '--execution-arn', managed.data.executionArn]), x => x.status, 40, 5000);
    save('managed-agent-execution.json', managedExecution);
    save('managed-agent-execution-history.json', aws(['stepfunctions', 'get-execution-history', '--execution-arn', managed.data.executionArn]));
    save('agent-core.json', agentSucceeded(managedExecution));
    save('latency.json', { askSeconds: recovery.seconds, agentSubmissionSeconds: submitted.seconds,
      agentCompletionSeconds: agentSeconds, managedSubmissionSeconds: managed.seconds,
      managedCompletionSeconds: (performance.now() - managedStart) / 1000,
      limitation: 'One request per path; completion polling adds up to 5s. Different questions; not a benchmark.' });
    save('log-groups.json', aws(['logs', 'describe-log-groups', '--log-group-name-prefix', `/aws/lambda/${STACK}`]));
    const today = new Date(); const tomorrow = new Date(today.getTime() + 86400000);
    try {
      save('cost.json', aws(['ce', 'get-cost-and-usage', '--time-period', `Start=${today.toISOString().slice(0, 10)},End=${tomorrow.toISOString().slice(0, 10)}`,
        '--granularity', 'DAILY', '--metrics', 'UnblendedCost', '--filter', JSON.stringify({ Dimensions: { Key: 'REGION', Values: [region] } })], 'us-east-1'));
    } catch (e) { save('cost.json', { available: false, reason: e.message }); }
    save('cost-limitations.txt', 'Cost Explorer is delayed and region-wide, not attributable lab spend. Reconcile later. MAX_SPEND_USD is not enforced as an AWS hard cap.');
    manifest.status = 'SMOKE_STRUCTURE_PASSED_HUMAN_REVIEW_PENDING';
  } catch (e) {
    manifest.status = 'FAILED'; manifest.error = e.message; throw e;
  } finally {
    if (attempted) {
      try { await destroy(); manifest.teardown = 'VERIFIED'; }
      catch (e) { manifest.teardown = 'FAILED'; manifest.teardownError = e.message; process.exitCode = 1; console.error(`CLEANUP NEEDS ATTENTION: ${e.message}`); }
    }
    manifest.finishedAt = new Date().toISOString(); save('manifest.json', manifest);
  }
}
if (require.main === module) main().catch(e => {
  if (manifest && evidence) {
    manifest.status = manifest.status === 'FAILED' ? 'FAILED' : 'FAILED_BEFORE_DEPLOYMENT';
    manifest.error = e.message; manifest.finishedAt = new Date().toISOString(); save('manifest.json', manifest);
  }
  console.error(e.message); process.exitCode = 1;
});
module.exports = { command };
