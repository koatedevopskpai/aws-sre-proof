import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { bedrock, opensearchserverless } from '@cdklabs/generative-ai-cdk-constructs';

// Lab storage, retrieval and shared tools, with hand-rolled and managed agents.
export class AgenticAiPlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Storage ---
    const docsBucket = new s3.Bucket(this, 'DocsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Incidents table the query_incidents tool reads. The by-severity GSI is the
    // access-pattern seam for the GSI-overloading depth signal later.
    const incidentsTable = new dynamodb.Table(this, 'IncidentsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    incidentsTable.addGlobalSecondaryIndex({
      indexName: 'by-severity',
      partitionKey: { name: 'severity', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // --- Knowledge base + vector store ---
    const vectorStore = new opensearchserverless.VectorCollection(this, 'VectorStore', {
      collectionName: 'platform-docs',
      // Disabled replicas to keep cost down for a lab; enable for production.
      standbyReplicas: opensearchserverless.VectorCollectionStandbyReplicas.DISABLED,
    });

    const knowledgeBase = new bedrock.VectorKnowledgeBase(this, 'KnowledgeBase', {
      // Cohere English is the alternative: bedrock.BedrockFoundationModel.COHERE_EMBED_ENGLISH_V3.
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      vectorStore,
      instruction: 'Answer platform-estate questions from the docs and cite sources.',
    });

    const dataSource = knowledgeBase.addS3DataSource({
      bucket: docsBucket,
      inclusionPrefixes: ['docs/'],
      // chunkingStrategy defaults to fixed-size (300 tokens, 20% overlap).
    });

    // --- Tool: query_incidents ---
    // Scoped to read-only on the incidents table. The IAM denial on anything
    // else is the least-privilege evidence, not the happy path.
    const queryIncidents = new NodejsFunction(this, 'QueryIncidentsTool', {
      entry: 'lambda/query_incidents/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { INCIDENTS_TABLE: incidentsTable.tableName },
    });
    incidentsTable.grantReadData(queryIncidents);

    // --- Tool: read_s3_doc ---
    const readS3Doc = new NodejsFunction(this, 'ReadS3DocTool', {
      entry: 'lambda/read_s3_doc/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { DOCS_BUCKET: docsBucket.bucketName },
    });
    docsBucket.grantRead(readS3Doc);

    // --- Tool: get_cluster_status (stub for now) ---
    const getClusterStatus = new NodejsFunction(this, 'GetClusterStatusTool', {
      entry: 'lambda/get_cluster_status/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { STATUS_URL: process.env.STATUS_URL ?? '' },
    });

    // --- Phase 1 RAG endpoint ---
    const askFn = new NodejsFunction(this, 'AskFunction', {
      entry: 'lambda/ask/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        // Replace with the model ID you have enabled in Bedrock.
        MODEL_ID: process.env.MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      },
    });
    // Refine to the specific KB + model ARNs once known; * is a Phase-1 starting point.
    askFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:Retrieve', 'bedrock:InvokeModel'],
      resources: ['*'],
    }));

    const api = new apigateway.RestApi(this, 'Api', {
      cloudWatchRole: false, // Avoid changing the account-wide API Gateway logging role for a short lab.
      defaultMethodOptions: { authorizationType: apigateway.AuthorizationType.IAM },
      deployOptions: { throttlingRateLimit: 2, throttlingBurstLimit: 3 },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST'],
      },
    });
    api.root.addResource('ask').addMethod(
      'POST',
      new apigateway.LambdaIntegration(askFn, { proxy: true }),
    );

    // --- Phase 3: hand-rolled agent loop (plan -> act -> observe) ---
    const MAX_ITERATIONS = 5;

    const planFn = new NodejsFunction(this, 'AgentPlanFunction', {
      entry: 'lambda/agent-plan/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        MODEL_ID: process.env.MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      },
    });
    planFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:Retrieve'],
      resources: ['*'],
    }));

    const actFn = new NodejsFunction(this, 'AgentActFunction', {
      entry: 'lambda/agent-act/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(60),
      environment: {
        QUERY_INCIDENTS_FN: queryIncidents.functionName,
        READ_S3_DOC_FN: readS3Doc.functionName,
        GET_STATUS_FN: getClusterStatus.functionName,
      },
    });
    [queryIncidents, readS3Doc, getClusterStatus].forEach((fn) => fn.grantInvoke(actFn));

    const planTask = new sfnTasks.LambdaInvoke(this, 'Plan', {
      lambdaFunction: planFn,
      payloadResponseOnly: true,
    });
    const actTask = new sfnTasks.LambdaInvoke(this, 'Act', {
      lambdaFunction: actFn,
      payloadResponseOnly: true,
    });
    const finalize = new sfn.Pass(this, 'Finalize', {
      parameters: {
        'answer.$': '$.answer',
        'iterations.$': '$.iteration',
        'question.$': '$.question',
      },
    });
    const failMax = new sfn.Fail(this, 'MaxIterations', {
      cause: 'Exceeded maximum tool iterations',
      error: 'MaxIterations',
    });
    const isTool = new sfn.Choice(this, 'IsTool')
      .when(sfn.Condition.stringEquals('$.next', 'tool'), actTask)
      .when(sfn.Condition.stringEquals('$.next', 'final'), finalize)
      .otherwise(failMax);
    const underMax = new sfn.Choice(this, 'UnderMaxIterations')
      .when(sfn.Condition.numberLessThan('$.iteration', MAX_ITERATIONS), planTask)
      .otherwise(failMax);
    planTask.next(isTool);
    actTask.next(underMax);

    const stateMachine = new sfn.StateMachine(this, 'AgentLoop', {
      definitionBody: sfn.DefinitionBody.fromChainable(planTask),
      timeout: cdk.Duration.minutes(5),
    });

    // POST /agent starts the loop and returns the execution ARN (poll for the result).
    const startAgent = new NodejsFunction(this, 'StartAgentFunction', {
      entry: 'lambda/start-agent/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { STATE_MACHINE_ARN: stateMachine.stateMachineArn },
    });
    stateMachine.grantStartExecution(startAgent);
    api.root.addResource('agent').addMethod(
      'POST',
      new apigateway.LambdaIntegration(startAgent, { proxy: true }),
    );

    // --- Phase 2: MCP server over streamable HTTP (stateless, Function URL) ---
    // IAM-authed: callers sign with SigV4, so the tool surface is not public.
    const mcpServerFn = new NodejsFunction(this, 'McpServerFunction', {
      entry: 'lambda/mcp-server/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        QUERY_INCIDENTS_FN: queryIncidents.functionName,
        READ_S3_DOC_FN: readS3Doc.functionName,
        GET_STATUS_FN: getClusterStatus.functionName,
      },
    });
    [queryIncidents, readS3Doc, getClusterStatus].forEach((fn) => fn.grantInvoke(mcpServerFn));
    const mcpUrl = new lambda.FunctionUrl(this, 'McpServerFunctionUrl', {
      function: mcpServerFn,
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    // --- Phase 4: same agent on Bedrock Agents (managed runtime) ---
    // The action group reuses the same three scoped tool Lambdas via a thin
    // dispatcher, so the managed agent and the hand-rolled loop share tools.
    const dispatcherFn = new NodejsFunction(this, 'BedrockToolDispatcher', {
      entry: 'lambda/bedrock-tool-dispatcher/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        QUERY_INCIDENTS_FN: queryIncidents.functionName,
        READ_S3_DOC_FN: readS3Doc.functionName,
        GET_STATUS_FN: getClusterStatus.functionName,
      },
    });
    [queryIncidents, readS3Doc, getClusterStatus].forEach((fn) => fn.grantInvoke(dispatcherFn));

    const toolOpenApi = {
      openapi: '3.0.0',
      info: { title: 'platform-tools', version: '1.0.0' },
      paths: {
        '/query_incidents': {
          get: {
            description: 'List platform incidents by severity.',
            parameters: [{ name: 'severity', in: 'query', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'OK' } },
          },
        },
        '/read_s3_doc': {
          get: {
            description: 'Read a document from the docs bucket.',
            parameters: [{ name: 'key', in: 'query', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'OK' } },
          },
        },
        '/get_cluster_status': {
          get: {
            description: 'Return platform cluster health status.',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const agent = new bedrock.Agent(this, 'PlatformAgent', {
      name: 'platform-operations-agent',
      instruction:
        'You are a platform operations assistant. Answer questions about the platform estate ' +
        'using the knowledge base and cite sources. Use the platform-tools action group to query ' +
        'live incidents, read documents, and check cluster status when the answer needs it. ' +
        'Do not guess when the data is unavailable.',
      foundationModel: new bedrock.BedrockFoundationModel(
        process.env.AGENT_MODEL_ID ?? 'deepseek.v3.2', { supportsAgents: true },
      ),
      knowledgeBases: [knowledgeBase],
      actionGroups: [
        new bedrock.AgentActionGroup({
          name: 'platform-tools',
          description: 'Query incidents, read docs, and get cluster status.',
          apiSchema: bedrock.InlineApiSchema.fromInline(JSON.stringify(toolOpenApi)),
          executor: bedrock.ActionGroupExecutor.fromlambdaFunction(dispatcherFn),
        }),
      ],
      shouldPrepareAgent: true,
    });

    const alias = new bedrock.AgentAlias(this, 'PlatformAgentAlias', {
      agent,
      aliasName: 'prod',
    });

    const invokeAgent = new NodejsFunction(this, 'InvokeAgentFunction', {
      entry: 'lambda/invoke-agent/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(120),
      environment: { AGENT_ID: agent.agentId, ALIAS_ID: alias.aliasId },
    });
    invokeAgent.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeAgent'],
      resources: [alias.aliasArn],
    }));
    // The managed stream can exceed API Gateway's integration deadline. Run it
    // in a Standard workflow and use the same execution-ARN contract as /agent.
    const managedStateMachine = new sfn.StateMachine(this, 'ManagedAgentWorkflow', {
      definitionBody: sfn.DefinitionBody.fromChainable(new sfnTasks.LambdaInvoke(this, 'InvokeManagedAgent', {
        lambdaFunction: invokeAgent,
        payloadResponseOnly: true,
        retryOnServiceExceptions: false,
      })),
      timeout: cdk.Duration.minutes(3),
    });
    const startManagedAgent = new NodejsFunction(this, 'StartManagedAgentFunction', {
      entry: 'lambda/start-agent/index.ts',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
      environment: { STATE_MACHINE_ARN: managedStateMachine.stateMachineArn },
    });
    managedStateMachine.grantStartExecution(startManagedAgent);
    api.root.addResource('agent-core').addMethod(
      'POST',
      new apigateway.LambdaIntegration(startManagedAgent, { proxy: true }),
    );

    // --- Safety net: auto-destroy this stack at a TTL ---
    // One-time EventBridge schedule deletes the stack (the OpenSearch collection
    // is the cost risk). Opt out with: cdk deploy -c disableAutoDestroy=true
    // and tune the window with: -c autoDestroyMinutes=240 (default).
    const disableAutoDestroy = this.node.tryGetContext('disableAutoDestroy');
    if (disableAutoDestroy !== true && disableAutoDestroy !== 'true') {
      const ttlMinutes = Number(this.node.tryGetContext('autoDestroyMinutes') ?? 240);
      if (!Number.isFinite(ttlMinutes) || ttlMinutes < 15 || ttlMinutes > 240) {
        throw new Error('autoDestroyMinutes must be between 15 and 240');
      }
      const destroyer = new NodejsFunction(this, 'StackDestroyer', {
        entry: 'lambda/stack-destroyer/index.ts',
        runtime: lambda.Runtime.NODEJS_24_X,
        environment: { STACK_NAME: this.stackName },
      });
      destroyer.addToRolePolicy(new iam.PolicyStatement({
        actions: ['cloudformation:DeleteStack'],
        resources: [this.stackId],
      }));

      const schedulerRole = new iam.Role(this, 'AutoDestroySchedulerRole', {
        assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      });
      destroyer.grantInvoke(schedulerRole);

      const ttlIso = new Date(Date.now() + ttlMinutes * 60_000).toISOString().slice(0, 19);
      new scheduler.CfnSchedule(this, 'AutoDestroySchedule', {
        scheduleExpression: `at(${ttlIso})`,
        flexibleTimeWindow: { mode: 'OFF' },
        target: {
          arn: destroyer.functionArn,
          roleArn: schedulerRole.roleArn,
          input: JSON.stringify({ action: 'destroy', stack: this.stackName }),
        },
      });

      new cdk.CfnOutput(this, 'AutoDestroyAt', { value: `${ttlIso} UTC (${ttlMinutes} min)` });
    }

    new cdk.CfnOutput(this, 'DocsBucketName', { value: docsBucket.bucketName });
    new cdk.CfnOutput(this, 'KnowledgeBaseId', { value: knowledgeBase.knowledgeBaseId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'QueryIncidentsFn', { value: queryIncidents.functionName });
    new cdk.CfnOutput(this, 'ReadS3DocFn', { value: readS3Doc.functionName });
    new cdk.CfnOutput(this, 'GetStatusFn', { value: getClusterStatus.functionName });
    new cdk.CfnOutput(this, 'AgentStateMachine', { value: stateMachine.stateMachineArn });
    new cdk.CfnOutput(this, 'ManagedAgentStateMachine', { value: managedStateMachine.stateMachineArn });
    new cdk.CfnOutput(this, 'McpServerUrl', { value: mcpUrl.url });
    new cdk.CfnOutput(this, 'AgentId', { value: agent.agentId });
    new cdk.CfnOutput(this, 'AgentAliasId', { value: alias.aliasId });
    new cdk.CfnOutput(this, 'IncidentsTableName', { value: incidentsTable.tableName });
    new cdk.CfnOutput(this, 'DataSourceId', { value: dataSource.dataSourceId });
  }
}
