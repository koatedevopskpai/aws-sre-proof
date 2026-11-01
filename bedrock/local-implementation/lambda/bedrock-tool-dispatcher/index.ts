import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});
const ROUTES: Record<string, { fn: string; arg: string | null }> = {
  '/query_incidents': { fn: process.env.QUERY_INCIDENTS_FN!, arg: 'severity' },
  '/read_s3_doc': { fn: process.env.READ_S3_DOC_FN!, arg: 'key' },
  '/get_cluster_status': { fn: process.env.GET_STATUS_FN!, arg: null },
};

// Bedrock Agents action-group Lambda executor. Maps the OpenAPI apiPath to the
// scoped tool Lambda and returns the classic action-group response shape. The
// same three tool Lambdas back both the hand-rolled loop and this agent.
export async function handler(event: any) {
  const apiPath = event.apiPath;
  const route = ROUTES[apiPath];
  if (!route) throw new Error(`unknown action route: ${apiPath}`);

  const props =
    event.requestBody?.content?.['application/json']?.properties ?? event.parameters ?? [];
  const args: Record<string, string> = {};
  for (const p of props) {
    if (p?.name && p.value !== undefined) args[p.name] = p.value;
  }

  const input = route.arg ? { [route.arg]: args[route.arg] } : {};

  const res = await lambda.send(new InvokeCommand({
    FunctionName: route.fn,
    Payload: JSON.stringify(input),
  }));
  if (res.FunctionError) throw new Error(`tool invocation failed: ${res.FunctionError}`);
  const payload = JSON.parse(new TextDecoder().decode(res.Payload));
  const result = payload?.body ? JSON.parse(payload.body) : payload;

  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup ?? 'platform-tools',
      apiPath,
      httpMethod: event.httpMethod ?? 'GET',
      httpStatusCode: 200,
      responseBody: { 'application/json': { body: JSON.stringify(result) } },
    },
  };
}
