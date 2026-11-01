'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const template = JSON.parse(fs.readFileSync('cdk.out/AgenticAiPlatformStack.template.json', 'utf8'));
const resources = Object.values(template.Resources);
const methods = resources.filter(r => r.Type === 'AWS::ApiGateway::Method' && r.Properties.HttpMethod === 'POST');
assert.equal(methods.length, 3);
assert.ok(methods.every(r => r.Properties.AuthorizationType === 'AWS_IAM'), 'Paid API must require IAM');
const bucket = resources.find(r => r.Type === 'AWS::S3::Bucket');
assert.equal(bucket.DeletionPolicy, 'Delete');
assert.ok(resources.some(r => r.Type === 'Custom::S3AutoDeleteObjects'), 'Populated bucket needs automatic emptying');
const invokes = resources.filter(r => r.Type === 'AWS::IAM::Policy').flatMap(r => r.Properties.PolicyDocument.Statement)
  .filter(s => s.Action === 'bedrock:InvokeAgent');
assert.equal(invokes.length, 1);
assert.match(JSON.stringify(invokes[0].Resource), /AgentAliasArn/);
assert.ok(!resources.some(r => r.Type === 'AWS::ApiGateway::Account'), 'Lab must not replace account-wide API logging settings');
assert.ok(resources.some(r => r.Type === 'AWS::Scheduler::Schedule'), 'Cleanup safety schedule missing');
const entries = Object.entries(template.Resources);
const managedResource = entries.find(([, r]) => r.Type === 'AWS::ApiGateway::Resource' && r.Properties.PathPart === 'agent-core');
const managedMethod = methods.find(r => r.Properties.ResourceId.Ref === managedResource[0]);
assert.match(JSON.stringify(managedMethod.Properties.Integration.Uri), /StartManagedAgentFunction/,
  'Managed API must submit asynchronously, never wait on InvokeAgent');
const workflow = entries.find(([id, r]) => id.startsWith('ManagedAgentWorkflow') && r.Type === 'AWS::StepFunctions::StateMachine')[1];
assert.match(JSON.stringify(workflow.Properties.DefinitionString), /InvokeAgentFunction/);
assert.match(JSON.stringify(workflow.Properties.DefinitionString), /TimeoutSeconds\\?\"?:?\s*180/);
console.log('Template invariants passed: IAM API, alias permission, bucket cleanup, no shared API account mutation, cleanup schedule.');
