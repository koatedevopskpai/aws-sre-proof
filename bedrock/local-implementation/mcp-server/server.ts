import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { z } from 'zod';

const lambda = new LambdaClient({});

async function invokeTool(functionName: string, input: unknown) {
  const res = await lambda.send(new InvokeCommand({
    FunctionName: functionName,
    Payload: JSON.stringify(input ?? {}),
  }));
  if (res.FunctionError) throw new Error(`tool invocation failed: ${res.FunctionError}`);
  const payload = JSON.parse(new TextDecoder().decode(res.Payload));
  return payload?.body ? JSON.parse(payload.body) : payload;
}

// Shared tool registration — used by both the stdio entry (local) and the
// streamable-HTTP Lambda entry. Each tool delegates to its scoped Lambda, so
// this process only needs lambda:InvokeFunction on the three tool ARNs.
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'platform-tools', version: '0.1.0' });

  server.registerTool('query_incidents', {
    description: 'List platform incidents by severity (P1..P4).',
    inputSchema: { severity: z.string().describe('Severity, e.g. P1') },
  }, async (args) => {
    const result = await invokeTool(process.env.QUERY_INCIDENTS_FN!, args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  server.registerTool('read_s3_doc', {
    description: 'Read a document from the platform docs bucket by key.',
    inputSchema: { key: z.string().describe('S3 object key') },
  }, async (args) => {
    const result = await invokeTool(process.env.READ_S3_DOC_FN!, args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  server.registerTool('get_cluster_status', {
    description: 'Return platform cluster health status.',
    inputSchema: {},
  }, async () => {
    const result = await invokeTool(process.env.GET_STATUS_FN!, {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  return server;
}
