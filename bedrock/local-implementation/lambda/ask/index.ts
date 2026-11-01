import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const agentRuntime = new BedrockAgentRuntimeClient({});
const bedrock = new BedrockRuntimeClient({});
const KB_ID = process.env.KNOWLEDGE_BASE_ID!;
const MODEL_ID = process.env.MODEL_ID!;

// Phase 1 RAG: retrieve top chunks, then answer grounded in them with citations.
// The grounding instruction is the mechanism that makes "docs don't cover it"
// produce a refusal rather than a hallucination.
export async function handler(event: any) {
  const body = event?.body ? JSON.parse(event.body) : event;
  const question = body?.question;
  if (!question) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing "question"' }) };
  }

  const retrieved = await agentRuntime.send(new RetrieveCommand({
    knowledgeBaseId: KB_ID,
    retrievalQuery: { text: question },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults: 5 },
    },
  }));

  const chunks = (retrieved.retrievalResults ?? []).map((r) => ({
    text: r.content?.text ?? '',
    source: r.location?.s3Location?.uri ?? r.metadata?.source ?? 'unknown',
  }));

  const context = chunks
    .map((c, i) => `[${i + 1}] source: ${c.source}\n${c.text}`)
    .join('\n\n');

  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{
      text:
        'Answer using ONLY the provided context. Cite sources as [n]. ' +
        'If the answer is not in the context, say so and do not guess.',
    }],
    messages: [{
      role: 'user',
      content: [{ text: `Context:\n${context}\n\nQuestion: ${question}` }],
    }],
    inferenceConfig: { maxTokens: 512, temperature: 0 },
  }));

  const answer = res.output?.message?.content?.[0]?.text ?? '';
  return {
    statusCode: 200,
    body: JSON.stringify({
      question,
      answer,
      citations: chunks.map((c) => c.source),
    }),
  };
}
