import { CloudFormationClient, DeleteStackCommand } from '@aws-sdk/client-cloudformation';

const cfn = new CloudFormationClient({});
const STACK_NAME = process.env.STACK_NAME!;

// Auto-destroy safety net: deletes this stack when the TTL schedule fires, so an
// abandoned OpenSearch Serverless collection can't keep billing. DeleteStack is
// async — CloudFormation tears down the stack (including this function) in the
// background after the call returns.
export async function handler(_event: any) {
  console.log(`auto-destroy: deleting stack ${STACK_NAME}`);
  await cfn.send(new DeleteStackCommand({ StackName: STACK_NAME }));
  return { stack: STACK_NAME, action: 'DeleteStack' };
}
