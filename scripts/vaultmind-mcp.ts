#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import {
  createMcpServerConfigFromEnv,
  runMcpIndexedContextSearch,
} from '@/lib/mcp/agent-context-tools';
import { mcpToolContracts } from '@/lib/mcp/tool-contracts';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';

import type { McpToolRuntime } from '@/lib/mcp/agent-context-tools';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';

function writeError(message: string) {
  process.stderr.write(`${message}\n`);
}

function readLocalEnv(): Record<string, string> {
  if (!existsSync('.env')) {
    return {};
  }

  const env: Record<string, string> = {};
  const envFile = readFileSync('.env', 'utf8');

  for (const line of envFile.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmedLine);

    if (!match?.[1] || match[2] === undefined) {
      continue;
    }

    env[match[1]] = match[2].replace(/^["']|["']$/gu, '');
  }

  return env;
}

function loadLocalEnv() {
  const localEnv = readLocalEnv();

  for (const [key, value] of Object.entries(localEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

class StaticSmokeEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;

  async createEmbedding(input: string): Promise<number[]> {
    return Array.from({ length: expectedEmbeddingDimensions }, (_value, index) =>
      index === 0 ? input.length : 0,
    );
  }
}

function createMcpRuntimeFromEnv(): McpToolRuntime {
  if (process.env.VAULTMIND_MCP_USE_STATIC_PROVIDERS !== '1') {
    return {};
  }

  return {
    embeddingProvider: new StaticSmokeEmbeddingProvider(),
  };
}

const indexedContextSearchInputSchema = {
  maxResults: z.number().int().min(1).max(12).optional(),
  query: z.string().trim().min(1).max(4000),
  sourceIds: z.array(z.uuid()).max(20).optional(),
};

async function main() {
  loadLocalEnv();

  const config = createMcpServerConfigFromEnv();
  const runtime = createMcpRuntimeFromEnv();
  const server = new McpServer({
    name: 'vaultmind-context-search',
    version: '0.1.0',
  });

  server.registerTool(
    mcpToolContracts.searchIndexedContext.name,
    {
      annotations: {
        readOnlyHint: mcpToolContracts.searchIndexedContext.readOnlyHint,
      },
      description: mcpToolContracts.searchIndexedContext.description,
      inputSchema: indexedContextSearchInputSchema,
      title: mcpToolContracts.searchIndexedContext.title,
    },
    async (input) => {
      const result = await runMcpIndexedContextSearch({
        config,
        input,
        runtime,
      });

      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: 'text',
          },
        ],
        structuredContent: result,
      };
    },
  );

  const transport = new StdioServerTransport();

  await server.connect(transport);
  writeError('VaultMind MCP server running on stdio.');
}

main().catch((error: unknown) => {
  writeError(error instanceof Error ? error.message : 'VaultMind MCP server failed.');
  process.exit(1);
});
