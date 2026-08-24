import { describe, expect, it } from 'vitest';

import {
  createMcpServerConfigFromEnv,
  McpToolError,
  runMcpIndexedContextSearch,
} from '@/lib/mcp/agent-context-tools';

import type { Db } from '@/db';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';

const workspaceIndexId = '00000000-0000-4000-8000-000000000010';

const embeddingProvider: EmbeddingProvider = {
  async createEmbedding() {
    return Array.from({ length: 1536 }, () => 0);
  },
  dimensions: 1536,
  model: 'text-embedding-3-small',
};

describe('createMcpServerConfigFromEnv', () => {
  it('requires only an explicit workspace scope', () => {
    expect(() => createMcpServerConfigFromEnv({})).toThrow(McpToolError);
    expect(
      createMcpServerConfigFromEnv({
        VAULTMIND_MCP_WORKSPACE_INDEX_ID: workspaceIndexId,
      }),
    ).toEqual({ workspaceIndexId });
  });

  it('rejects an invalid workspace identifier', () => {
    expect(() =>
      createMcpServerConfigFromEnv({ VAULTMIND_MCP_WORKSPACE_INDEX_ID: 'not-a-uuid' }),
    ).toThrow(McpToolError);
  });
});

describe('MCP runtime unavailable handling', () => {
  const brokenDb = {
    select() {
      throw new Error('database unavailable with internal host db.internal');
    },
  } as unknown as Db;

  it('maps indexed search failures to a generic error', async () => {
    await expect(
      runMcpIndexedContextSearch({
        config: { workspaceIndexId },
        input: { query: 'release readiness' },
        runtime: { db: brokenDb, embeddingProvider },
      }),
    ).rejects.toMatchObject({
      code: 'mcp-runtime-unavailable',
      status: 503,
    });
  });
});
