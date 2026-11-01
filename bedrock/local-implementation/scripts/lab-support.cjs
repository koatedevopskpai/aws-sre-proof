'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

class Sha256 {
  constructor(secret) { this.hash = secret ? crypto.createHmac('sha256', secret) : crypto.createHash('sha256'); }
  update(data) { this.hash.update(data); }
  async digest() { return this.hash.digest(); }
}
function ingestionComplete(job) {
  assert.equal(job.status, 'COMPLETE', `Ingestion did not complete: ${job.status}`);
  assert.equal(job.statistics?.numberOfDocumentsFailed ?? 0, 0, 'Ingestion contains failed documents');
}
function agentSucceeded(execution) {
  assert.equal(execution.status, 'SUCCEEDED', `Agent execution ended: ${execution.status}`);
  const result = JSON.parse(execution.output);
  assert.ok(result.answer?.trim(), 'Agent returned an empty answer');
  return result;
}
function ragHasCitations(result) {
  assert.ok(result.answer?.trim(), 'RAG returned an empty answer');
  assert.ok(Array.isArray(result.citations) && result.citations.length, 'No retrieval sources');
  const refs = [...result.answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
  assert.ok(refs.length && refs.every(n => n >= 1 && n <= result.citations.length), 'Missing/invalid citation markers');
}
function pollTerminal(status) { return !['RUNNING', 'STARTING', 'IN_PROGRESS', 'PENDING'].includes(status); }
module.exports = { Sha256, ingestionComplete, agentSucceeded, ragHasCitations, pollTerminal };
