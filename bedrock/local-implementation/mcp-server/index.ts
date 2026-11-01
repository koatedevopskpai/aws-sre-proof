// Local stdio MCP server — run with any MCP host (Claude Desktop, LangGraph/MCP
// clients). See the Lambda entry (lambda/mcp-server) for the hosted version.
//
//   QUERY_INCIDENTS_FN=<...> READ_S3_DOC_FN=<...> GET_STATUS_FN=<...> npx tsx mcp-server/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

async function main() {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
