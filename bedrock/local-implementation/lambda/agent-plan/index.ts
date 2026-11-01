import type { Tool } from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

const bedrock = new BedrockRuntimeClient({});
const agentRuntime = new BedrockAgentRuntimeClient({});
const KB_ID = process.env.KNOWLEDGE_BASE_ID!;
const MODEL_ID = process.env.MODEL_ID!;

// Tool schemas are duplicated here (from the MCP server) because the hand-rolled
// loop calls tools directly; the MCP surface is the alternative path for Phase 4.
const TOOLS: Tool[] = [
  {
    toolSpec: {
      name: 'query_incidents',
      description: 'List platform incidents by severity (P1..P4).',
      inputSchema: {
        json: {
          type: 'object',
          properties: { severity: { type: 'string', description: 'Severity, e.g. P1' } },
          required: ['severity'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'read_s3_doc',
      description: 'Read a document from the platform docs bucket by key.',
      inputSchema: {
        json: {
          type: 'object',
          properties: { key: { type: 'string', description: 'S3 object key' } },
          required: ['key'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'get_cluster_status',
      description: 'Return platform cluster health status.',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
];

const SYSTEM = [
  {
    text:
      'You are a platform operations assistant. Answer from the provided context and cite sources as [n]. ' +
      'Use tools to query the estate when the answer needs live data. ' +
      'If the answer is not in the context or tools, say so; do not guess.',
  },
];

// plan: call Converse; return the next tool use or the final answer.
export async function handler(event: any) {
  const question = event.question;
  const iteration = event.iteration ?? 0;
  let messages = event.messages ?? [];

  // First pass: retrieve context and seed the conversation.
  if (messages.length === 0) {
    const context = await retrieveContext(question);
    messages = [
      { role: 'user', content: [{ text: `Context:\n${context}\n\nQuestion: ${question}` }] },
    ];
  }

  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: SYSTEM,
    messages,
    toolConfig: { tools: TOOLS },
    inferenceConfig: { maxTokens: 1024, temperature: 0 },
  }));

  const blocks: any[] = res.output?.message?.content ?? [];
  const toolUses = blocks.filter((b) => b.toolUse).map((b) => b.toolUse);
  const text = blocks
    .filter((b) => b.text)
    .map((b) => b.text)
    .join('');

  if (toolUses.length > 0) {
    return {
      next: 'tool',
      toolUses,
      messages: [...messages, { role: 'assistant', content: blocks }],
      iteration,
      question,
    };
  }

  return { next: 'final', answer: text, messages, iteration, question };
}

async function retrieveContext(question: string): Promise<string> {
  const r = await agentRuntime.send(new RetrieveCommand({
    knowledgeBaseId: KB_ID,
    retrievalQuery: { text: question },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults: 5 },
    },
  }));
  return (r.retrievalResults ?? [])
    .map((x: any, i: number) =>
      `[${i + 1}] source: ${x.location?.s3Location?.uri ?? x.metadata?.source ?? 'unknown'}\n${x.content?.text ?? ''}`)
    .join('\n\n');
}
