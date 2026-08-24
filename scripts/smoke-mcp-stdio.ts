import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { getDb } from '@/db';
import { mcpToolContracts, mcpToolNames } from '@/lib/mcp/tool-contracts';
import {
  cleanupMcpSmokeFixture,
  createMcpSmokeFixture,
  defaultMcpSmokeDatabaseUrl,
  loadLocalEnv,
  writeLine,
} from './smoke-mcp-local';

function getProcessEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      const [, value] = entry;

      return typeof value === 'string';
    }),
  );
}

function readResultCount(value: unknown): number | null {
  if (!value || typeof value !== 'object' || !('resultCount' in value)) {
    return null;
  }

  return typeof value.resultCount === 'number' ? value.resultCount : null;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim() || defaultMcpSmokeDatabaseUrl;

  process.env.DATABASE_URL = databaseUrl;
  const db = getDb();
  const fixture = await createMcpSmokeFixture(db);
  const transport = new StdioClientTransport({
    args: ['exec', 'tsx', 'scripts/vaultmind-mcp.ts'],
    command: 'pnpm',
    cwd: process.cwd(),
    env: {
      ...getProcessEnv(),
      DATABASE_URL: databaseUrl,
      VAULTMIND_MCP_USE_STATIC_PROVIDERS: '1',
      VAULTMIND_MCP_WORKSPACE_INDEX_ID: fixture.workspaceIndexId,
    },
    stderr: 'pipe',
  });
  const client = new Client({
    name: 'vaultmind-mcp-stdio-smoke',
    version: '0.1.0',
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();

    if (
      toolNames.length !== mcpToolNames.length ||
      mcpToolNames.some((toolName) => !toolNames.includes(toolName))
    ) {
      throw new Error(`Unexpected MCP tools: ${toolNames.join(', ')}`);
    }

    const searchResult = await client.callTool({
      arguments: {
        maxResults: 4,
        query: 'How does VaultMind retrieve cited context?',
        sourceIds: [fixture.sourceId],
      },
      name: mcpToolContracts.searchIndexedContext.name,
    });
    const resultCount = readResultCount(searchResult.structuredContent);

    if (resultCount !== 1) {
      throw new Error(
        `Unexpected search_indexed_context result count: ${resultCount ?? 'missing'}`,
      );
    }

    writeLine(
      JSON.stringify(
        {
          resultCount,
          tools: toolNames,
          workspaceIndexId: fixture.workspaceIndexId,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
    await cleanupMcpSmokeFixture({ db, fixture });
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    writeLine(`FAIL ${error instanceof Error ? error.message : 'MCP STDIO smoke failed.'}`);
    process.exit(1);
  });
