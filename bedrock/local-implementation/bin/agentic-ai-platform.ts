#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AgenticAiPlatformStack } from '../lib/agentic-ai-platform-stack';

const app = new cdk.App();

new AgenticAiPlatformStack(app, 'AgenticAiPlatformStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-2',
  },
});
