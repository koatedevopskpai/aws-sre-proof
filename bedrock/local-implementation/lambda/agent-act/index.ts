import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});
const FN_MAP: Record<string, string | undefined> = {
  query_incidents: process.env.QUERY_INCIDENTS_FN,
  read_s3_doc: process.env.READ_S3_DOC_FN,
  get_cluster_status: process.env.GET_STATUS_FN,
};

// act: dispatch a tool call to the scoped tool Lambda, then append the
// assistant toolUse + user toolResult messages so the next plan call sees them.
export async function handler(event: any) {
  const { toolUses, messages, iteration, question } = event;
  if (!Array.isArray(toolUses) || toolUses.length === 0) throw new Error('missing tool calls');
  const results = [];
  for (const { name, input, toolUseId } of toolUses) {
    const fn = FN_MAP[name];
    if (!fn) throw new Error(`unknown tool: ${name}`);
    const res = await lambda.send(new InvokeCommand({
      FunctionName: fn, Payload: JSON.stringify(input ?? {}),
    }));
    const payload = JSON.parse(new TextDecoder().decode(res.Payload));
    const result = payload?.body ? JSON.parse(payload.body) : payload;
    results.push({ toolResult: {
      toolUseId, content: [{ json: result }],
      status: res.FunctionError || payload?.statusCode >= 400 ? 'error' : 'success',
    } });
  }
  const nextMessages = [
    ...messages,
    { role: 'user', content: results },
  ];

  return { question, messages: nextMessages, iteration: iteration + 1 };
}
