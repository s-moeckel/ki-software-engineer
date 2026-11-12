import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBookServer } from './server.js';

async function main() {
  const server = createBookServer({ apiUrl: process.env['BOOKMONKEY_API_URL'] });
  await server.connect(new StdioServerTransport());
}

// stdout is reserved exclusively for the MCP JSON-RPC protocol.
void main().catch(error => {
  console.error('BookMonkey MCP konnte nicht gestartet werden:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
