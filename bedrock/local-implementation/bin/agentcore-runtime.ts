#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgentCoreRuntimeStack } from '../lib/agentcore-runtime-stack';

const app = new cdk.App();
const context = (key: string, fallback: string): string =>
  (app.node.tryGetContext(key) as string | undefined) ?? fallback;

new AgentCoreRuntimeStack(app, 'GallandAgentCoreRuntimeStack', {
  env: {
    account:
      (app.node.tryGetContext('account') as string | undefined) ??
      process.env.CDK_DEFAULT_ACCOUNT ??
      '123456789012',
    region:
      (app.node.tryGetContext('region') as string | undefined) ??
      process.env.CDK_DEFAULT_REGION ??
      'us-west-2',
  },
  containerImageUri: context(
    'containerImageUri',
    '123456789012.dkr.ecr.us-west-2.amazonaws.com/galland-agentcore:placeholder',
  ),
  modelId: context('modelId', 'us.amazon.nova-2-lite-v1:0'),
  queryIncidentsFunctionName: context('queryIncidentsFunctionName', 'galland-query-incidents'),
  readS3DocFunctionName: context('readS3DocFunctionName', 'galland-read-s3-doc'),
  getClusterStatusFunctionName: context(
    'getClusterStatusFunctionName',
    'galland-cluster-status',
  ),
  agentEnabled: context('agentEnabled', 'true') !== 'false',
  projectTag: context('projectTag', 'galland-agentic-usw2'),
});
