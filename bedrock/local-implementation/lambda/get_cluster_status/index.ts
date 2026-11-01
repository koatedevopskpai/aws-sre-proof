// Stub tool. Phase 2+ replaces this with an HTTP GET to a mock status API
// Lambda (STATUS_URL), so the agent has a tool with a real network side effect
// to exercise under chaos.
export async function handler(_event: any) {
  return {
    status: 'ok',
    nodes: 7,
    etcd: 'healthy',
    source: 'stub',
    note: 'TODO: replace with HTTP GET to STATUS_URL mock API',
  };
}
