import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';

export interface AgentCoreRuntimeStackProps extends cdk.StackProps {
  readonly containerImageUri: string;
  readonly modelId: string;
  readonly queryIncidentsFunctionName: string;
  readonly readS3DocFunctionName: string;
  readonly getClusterStatusFunctionName: string;
  readonly agentEnabled?: boolean;
  readonly projectTag?: string;
}

/**
 * Minimal AgentCore Runtime milestone.
 *
 * One ARM64 container, one HTTP protocol runtime, one endpoint and one
 * least-privilege execution role. No Gateway, Memory, vector store or
 * mutation path is created in this first slice.
 */
export class AgentCoreRuntimeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AgentCoreRuntimeStackProps) {
    super(scope, id, props);

    const projectTag = props.projectTag ?? 'galland-agentic-usw2';
    const runtimeName = 'galland_agentcore_proof';
    const functionNames = {
      query_incidents: props.queryIncidentsFunctionName,
      read_s3_doc: props.readS3DocFunctionName,
      get_cluster_status: props.getClusterStatusFunctionName,
    };

    const role = new iam.Role(this, 'RuntimeRole', {
      roleName: `${runtimeName}_execution`,
      description: 'AgentCore Runtime execution role for the synthetic read-only proof',
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': `arn:aws:bedrock-agentcore:${this.region}:${this.account}:*`,
          },
        },
      }),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrImageAccess',
        actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
        resources: [`arn:aws:ecr:${this.region}:${this.account}:repository/*`],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EcrTokenAccess',
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockInvoke',
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadOnlyToolInvocation',
        actions: ['lambda:InvokeFunction'],
        resources: Object.values(functionNames).map((name) =>
          cdk.Stack.of(this).formatArn({
            service: 'lambda',
            resource: 'function',
            resourceName: name,
          }),
        ),
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RuntimeLogs',
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogStreams',
          'logs:PutResourcePolicy',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*`,
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*`,
        ],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DescribeRuntimeLogGroups',
        actions: ['logs:DescribeLogGroups'],
        resources: ['*'],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RuntimeObservability',
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RuntimeMetrics',
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: { StringEquals: { 'cloudwatch:namespace': 'bedrock-agentcore' } },
      }),
    );

    const runtime = new agentcore.CfnRuntime(this, 'Runtime', {
      agentRuntimeName: runtimeName,
      description: 'Synthetic read-only AgentCore Runtime proof; no mutation tools',
      agentRuntimeArtifact: {
        containerConfiguration: {
          containerUri: props.containerImageUri,
        },
      },
      roleArn: role.roleArn,
      networkConfiguration: { networkMode: 'PUBLIC' },
      protocolConfiguration: 'HTTP',
      lifecycleConfiguration: {
        idleRuntimeSessionTimeout: 300,
        maxLifetime: 3600,
      },
      environmentVariables: {
        AGENT_ENABLED: String(props.agentEnabled ?? true),
        MODEL_ID: props.modelId,
        QUERY_INCIDENTS_FUNCTION: functionNames.query_incidents,
        READ_S3_DOC_FUNCTION: functionNames.read_s3_doc,
        GET_CLUSTER_STATUS_FUNCTION: functionNames.get_cluster_status,
        AGENT_MAX_TURNS: '4',
        AGENT_MAX_TOOL_CALLS: '6',
        AGENT_MAX_MODEL_CALLS: '4',
        AGENT_MAX_PROMPT_CHARS: '4000',
        AGENT_MAX_OUTPUT_TOKENS: '512',
        AGENT_MAX_RUNTIME_SECONDS: '60',
        AGENT_MAX_CONCURRENCY: '2',
      },
    });

    const endpoint = new agentcore.CfnRuntimeEndpoint(this, 'Endpoint', {
      agentRuntimeId: runtime.attrAgentRuntimeId,
      name: `${runtimeName}_endpoint`,
      description: 'Bounded synthetic proof endpoint',
    });

    cdk.Tags.of(runtime).add('Project', projectTag);
    cdk.Tags.of(runtime).add('Environment', 'lab');
    cdk.Tags.of(endpoint).add('Project', projectTag);
    cdk.Tags.of(role).add('Project', projectTag);

    new cdk.CfnOutput(this, 'AgentRuntimeArn', { value: runtime.attrAgentRuntimeArn });
    new cdk.CfnOutput(this, 'AgentRuntimeId', { value: runtime.attrAgentRuntimeId });
    new cdk.CfnOutput(this, 'AgentRuntimeEndpointArn', {
      value: endpoint.attrAgentRuntimeEndpointArn,
    });
    new cdk.CfnOutput(this, 'ExecutionRoleArn', { value: role.roleArn });
    new cdk.CfnOutput(this, 'LogGroupHint', {
      value: `/aws/bedrock-agentcore/runtimes/${runtimeName}`,
    });
  }
}
