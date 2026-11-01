import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { randomUUID } from 'crypto';

const client = new BedrockAgentRuntimeClient({});

// Workflow worker: failures must fail the execution, not return HTTP success.
export async function handler(event: any) {
  const question = event?.question;
  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('missing "question"');
  }

  const res = await client.send(new InvokeAgentCommand({
    agentId: process.env.AGENT_ID!,
    agentAliasId: process.env.ALIAS_ID!,
    sessionId: randomUUID(),
    inputText: question,
  }));

  let text = '';
  const decoder = new TextDecoder();
  for await (const evt of res.completion ?? []) {
    if (evt.chunk?.bytes) {
      text += decoder.decode(evt.chunk.bytes, { stream: true });
    } else if (Object.keys(evt).some(key => /Exception$/.test(key))) {
      throw new Error(`Managed agent stream failed: ${JSON.stringify(evt)}`);
    }
  }
  text += decoder.decode();
  if (!text.trim()) throw new Error('Managed agent returned an empty answer');
  return { question, answer: text };
}
