'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { ingestionComplete, agentSucceeded, ragHasCitations, pollTerminal, Sha256 } = require('../scripts/lab-support.cjs');
const { command } = require('../scripts/lab-run.cjs');

test('stalled subprocess is terminated and surfaces a failure instead of hanging the runner', () => {
  const started = Date.now();
  assert.throws(() => command(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeout: 100 }), /timed out|ETIMEDOUT/);
  assert.ok(Date.now() - started < 5000);
});

function cleanupHarness({ inventory, live, remainingFunction = false }) {
  const calls = [];
  const source = fs.readFileSync(path.join(__dirname, '../scripts/lab-run.cjs'), 'utf8');
  const fakeFs = {
    existsSync: () => Boolean(inventory),
    readFileSync: () => JSON.stringify(inventory),
    writeFileSync: () => {},
  };
  const fakeSpawn = (_exe, args) => {
    calls.push(args);
    if (args[0] === 'cloudformation' && args[1] === 'describe-stacks') return live
      ? { status: 0, stdout: JSON.stringify({ Stacks: [live] }) }
      : { status: 1, stderr: 'Stack does not exist' };
    if (args[0] === 'lambda' && args[1] === 'get-function-configuration') return remainingFunction
      ? { status: 0, stdout: '{}' } : { status: 1, stderr: 'ResourceNotFoundException' };
    return { status: 0, stdout: '{}' };
  };
  const context = { module: { exports: {} }, __dirname: path.join(__dirname, '../scripts'),
    process: { env: {}, chdir: () => {} }, console, setTimeout, Buffer, URL, AbortSignal,
    require: name => name === 'node:fs' ? fakeFs : name === 'node:child_process' ? { spawnSync: fakeSpawn }
      : name === './lab-support.cjs' ? require('../scripts/lab-support.cjs') : require(name) };
  vm.runInNewContext(source + '\nmodule.exports.exercise = async () => { evidence = "fixture"; manifest = { stackId: "original", runId: "fixture" }; await destroy(); };', context);
  return { run: context.module.exports.exercise, calls };
}
test('absent stack still checks recorded resources and fails on a surviving Lambda', async () => {
  const fixture = cleanupHarness({ inventory: { StackResourceSummaries: [{ ResourceType: 'AWS::Lambda::Function', PhysicalResourceId: 'fixture-function' }] }, remainingFunction: true });
  await assert.rejects(fixture.run(), /Lab resources remain/);
  assert.ok(fixture.calls.some(args => args[0] === 'lambda' && args.includes('fixture-function')));
});
test('absent stack without an inventory cannot claim verified cleanup', async () => {
  await assert.rejects(cleanupHarness({}).run(), /no resource inventory/);
});
test('cleanup refuses a replacement stack before any delete action', async () => {
  const fixture = cleanupHarness({ live: { StackId: 'replacement', StackStatus: 'CREATE_COMPLETE' } });
  await assert.rejects(fixture.run(), /Stack replaced/);
  assert.equal(fixture.calls.some(args => args.includes('delete-stack')), false);
});

test('failed or incomplete ingestion cannot pass the smoke gate', () => {
  for (const status of ['FAILED', 'STOPPED', 'IN_PROGRESS']) assert.throws(() => ingestionComplete({ status }));
  assert.throws(() => ingestionComplete({ status: 'COMPLETE', statistics: { numberOfDocumentsFailed: 1 } }));
  ingestionComplete({ status: 'COMPLETE', statistics: { numberOfDocumentsFailed: 0 } });
});
test('agent failure, timeout and empty answers cannot pass', () => {
  for (const status of ['FAILED', 'TIMED_OUT', 'ABORTED', 'RUNNING']) assert.throws(() => agentSucceeded({ status }));
  assert.throws(() => agentSucceeded({ status: 'SUCCEEDED', output: '{"answer":""}' }));
  assert.equal(agentSucceeded({ status: 'SUCCEEDED', output: '{"answer":"Two incidents"}' }).answer, 'Two incidents');
  assert.equal(pollTerminal('TIMED_OUT'), true);
  assert.equal(pollTerminal('RUNNING'), false);
});
test('citation structure is checked without claiming semantic grounding', () => {
  assert.throws(() => ragHasCitations({ answer: 'Rollback [2]', citations: ['s3://fixture/recovery.md'] }));
  assert.throws(() => ragHasCitations({ answer: 'Rollback', citations: ['s3://fixture/recovery.md'] }));
  ragHasCitations({ answer: 'Rollback [1]', citations: ['s3://fixture/recovery.md'] });
});
test('SigV4 hash adapter matches SHA-256 known answer', async () => {
  const hash = new Sha256(); hash.update('abc');
  assert.equal((await hash.digest()).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
function handler(file, responses, calls) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  class Client { async send(command) { calls.push(command.input); return responses.shift(); } }
  class Command { constructor(input) { this.input = input; } }
  const exports = {};
  vm.runInNewContext(compiled, { exports, process: { env: {
    QUERY_INCIDENTS_FN: 'query', READ_S3_DOC_FN: 'read', GET_STATUS_FN: 'status',
  } }, TextDecoder, require: name => {
    if (name === 'crypto') return require('node:crypto');
    assert.ok(name.startsWith('@aws-sdk/'));
    return { LambdaClient: Client, InvokeCommand: Command, BedrockRuntimeClient: Client,
      ConverseCommand: Command, BedrockAgentRuntimeClient: Client, RetrieveCommand: Command,
      InvokeAgentCommand: Command, SFNClient: Client, StartExecutionCommand: Command };
  } });
  return exports.handler;
}
test('planner preserves every assistant tool call and its text', async () => {
  const blocks = [{ text: 'Checking both tools' }, { toolUse: { name: 'query_incidents', toolUseId: 'one', input: { severity: 'P1' } } },
    { toolUse: { name: 'get_cluster_status', toolUseId: 'two', input: {} } }];
  const run = handler('lambda/agent-plan/index.ts', [{ output: { message: { content: blocks } } }], []);
  const result = await run({ question: 'Check', messages: [{ role: 'user', content: [{ text: 'Check' }] }] });
  assert.equal(result.toolUses.length, 2);
  assert.equal(result.messages.at(-1).content, blocks);
});
test('managed worker preserves split UTF-8 and returns workflow output', async () => {
  const bytes = Buffer.from('Two incidents ✓');
  const run = handler('lambda/invoke-agent/index.ts', [{ completion: (async function* () {
    yield { chunk: { bytes: bytes.subarray(0, bytes.length - 1) } };
    yield { chunk: { bytes: bytes.subarray(bytes.length - 1) } };
  })() }], []);
  const result = await run({ question: 'How many?' });
  assert.equal(result.answer, 'Two incidents ✓');
  assert.equal(result.statusCode, undefined);
});
test('managed worker fails the workflow on stream errors, empty answers and invalid input', async () => {
  const run = handler('lambda/invoke-agent/index.ts', [
    { completion: (async function* () { yield { throttlingException: { message: 'quota' } }; })() },
    { completion: (async function* () {})() },
  ], []);
  await assert.rejects(run({ question: 'Check' }), /stream failed/);
  await assert.rejects(run({ question: 'Check' }), /empty answer/);
  await assert.rejects(run({ question: ' ' }), /missing/);
});
test('API submission returns 202 and serialises the question to a workflow', async () => {
  const calls = [];
  const run = handler('lambda/start-agent/index.ts', [{ executionArn: 'arn:fixture:execution' }], calls);
  const result = await run({ body: JSON.stringify({ question: 'Count P1' }) });
  assert.equal(result.statusCode, 202);
  assert.equal(JSON.parse(result.body).executionArn, 'arn:fixture:execution');
  assert.equal(JSON.parse(calls[0].input).question, 'Count P1');
});
test('actor reports Lambda errors and returns a result for every tool call', async () => {
  const calls = [];
  const run = handler('lambda/agent-act/index.ts', [
    { Payload: Buffer.from('{"incidents":[]}') },
    { FunctionError: 'Unhandled', Payload: Buffer.from('{"errorMessage":"fixture failure"}') },
  ], calls);
  const result = await run({ question: 'Check', iteration: 0, messages: [{ role: 'assistant', content: [] }], toolUses: [
    { name: 'query_incidents', toolUseId: 'one', input: { severity: 'P1' } },
    { name: 'get_cluster_status', toolUseId: 'two', input: {} },
  ] });
  assert.equal(calls.length, 2);
  assert.equal(result.messages.at(-1).content[0].toolResult.status, 'success');
  assert.equal(result.messages.at(-1).content[1].toolResult.status, 'error');
  assert.equal(result.iteration, 1);
});
test('unknown Bedrock action does not silently call cluster status', async () => {
  const calls = [];
  const run = handler('lambda/bedrock-tool-dispatcher/index.ts', [], calls);
  await assert.rejects(run({ apiPath: '/typo' }), /unknown action route/);
  assert.equal(calls.length, 0);
});
