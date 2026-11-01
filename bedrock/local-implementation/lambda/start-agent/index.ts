import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const sfn = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;

// POST /agent — start the agent loop and return the execution ARN (poll for the result).
export async function handler(event: any) {
  const body = event?.body ? JSON.parse(event.body) : event;
  const question = body?.question;
  if (!question) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing "question"' }) };
  }

  const res = await sfn.send(new StartExecutionCommand({
    stateMachineArn: STATE_MACHINE_ARN,
    input: JSON.stringify({ question }),
  }));

  return {
    statusCode: 202,
    body: JSON.stringify({ executionArn: res.executionArn, question }),
  };
}
