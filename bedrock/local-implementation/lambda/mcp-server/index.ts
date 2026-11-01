import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '../../mcp-server/server.js';

// Stateless MCP server over streamable HTTP, behind a Lambda Function URL.
// Each invocation builds a Web Request from the API Gateway v2 event, handles
// one JSON-RPC exchange, and returns the Web Response.
export async function handler(event: any) {
  const request = toRequest(event);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: one request, one response
    enableJsonResponse: true,      // plain JSON body, no SSE stream
  });
  const server = createMcpServer();
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  return toLambdaResponse(response);
}

function toRequest(event: any): Request {
  const method = event.requestContext?.http?.method ?? 'POST';
  const host = event.headers?.host ?? 'localhost';
  const path = event.rawPath ?? '/';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    headers.set(k as string, v as string);
  }
  const body = event.body
    ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body)
    : undefined;
  return new Request(`https://${host}${path}${query}`, { method, headers, body });
}

async function toLambdaResponse(response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  const body = await response.text();
  return { statusCode: response.status, headers, body };
}
