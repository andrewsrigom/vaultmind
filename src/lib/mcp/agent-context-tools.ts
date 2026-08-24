import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { workspaceIndexes } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import { createPromptSnippet } from '@/lib/prompts';
import { RagRetrievalError, searchRelevantChunks } from '@/lib/rag/search-relevant-chunks';

import type { Db } from '@/db';
import type { WorkspaceSourceType } from '@/db/schema';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { RelevantChunk } from '@/lib/rag/search-relevant-chunks';

export type McpServerConfig = {
  workspaceIndexId: string;
};

export type McpToolRuntime = {
  db?: Db;
  embeddingProvider?: EmbeddingProvider;
};

export type McpIndexedContextSearchInput = {
  maxResults?: number | undefined;
  query: string;
  sourceIds?: string[] | undefined;
};

export type McpSourceReference = {
  chunkId: string;
  citationIndex: number;
  documentId: string;
  path: string;
  snippet: string;
  sourceId: string;
  sourceName: string;
  sourceType: WorkspaceSourceType;
  title: string;
};

export type McpIndexedContextSearchResult = {
  limits: {
    maxResults: number;
    sourceSnippetMaxCharacters: number;
  };
  omissions: {
    sourceReferences: number;
  };
  query: string;
  resultCount: number;
  results: McpSourceReference[];
  workspaceIndexId: string;
};

export type McpToolErrorCode =
  | 'mcp-config-invalid'
  | 'mcp-runtime-unavailable'
  | 'mcp-search-query-invalid'
  | 'mcp-workspace-not-found';

export class McpToolError extends Error {
  code: McpToolErrorCode;
  status: number;

  constructor(code: McpToolErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const defaultMaxResults = 8;
const maxResultsLimit = 12;
const sourceSnippetMaxCharacters = 500;
const logger = createLogger('mcp-context-search');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function handleMcpRuntimeError(error: unknown): never {
  if (error instanceof McpToolError) {
    throw error;
  }

  logger.warn('MCP indexed search failed.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });

  throw new McpToolError(
    'mcp-runtime-unavailable',
    'VaultMind MCP search is temporarily unavailable. Check database and embedding provider configuration, then retry.',
    503,
  );
}

function getMaxResults(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultMaxResults;
  }

  return Math.min(Math.max(Math.trunc(value), 1), maxResultsLimit);
}

function normalizeSearchQuery(query: string): string {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length === 0) {
    throw new McpToolError('mcp-search-query-invalid', 'Search query must not be empty.', 400);
  }

  return normalizedQuery;
}

function normalizeSourceIds(sourceIds: string[] | undefined): string[] {
  return sourceIds?.length
    ? [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))]
    : [];
}

function toSourceReference(chunk: RelevantChunk, index: number): McpSourceReference {
  return {
    chunkId: chunk.chunkId,
    citationIndex: index + 1,
    documentId: chunk.documentId,
    path: chunk.path,
    snippet: createPromptSnippet(chunk.content, sourceSnippetMaxCharacters),
    sourceId: chunk.sourceId,
    sourceName: chunk.sourceName,
    sourceType: chunk.sourceType,
    title: chunk.title,
  };
}

function getUniqueSourceReferences(sources: McpSourceReference[]): McpSourceReference[] {
  const seen = new Set<string>();

  return sources.filter((source) => {
    const key = `${source.sourceType}:${source.sourceId}:${source.path}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function assertWorkspaceScope(db: Db, workspaceIndexId: string): Promise<void> {
  const [workspaceIndex] = await db
    .select({ id: workspaceIndexes.id })
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, workspaceIndexId))
    .limit(1);

  if (!workspaceIndex) {
    throw new McpToolError(
      'mcp-workspace-not-found',
      'Configured VaultMind MCP workspace was not found.',
      404,
    );
  }
}

export function createMcpServerConfigFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): McpServerConfig {
  const workspaceIndexId = env.VAULTMIND_MCP_WORKSPACE_INDEX_ID?.trim();

  if (!workspaceIndexId || !uuidPattern.test(workspaceIndexId)) {
    throw new McpToolError(
      'mcp-config-invalid',
      'Set VAULTMIND_MCP_WORKSPACE_INDEX_ID to a valid workspace UUID before starting the VaultMind MCP server.',
      500,
    );
  }

  return { workspaceIndexId };
}

export async function runMcpIndexedContextSearch({
  config,
  input,
  runtime = {},
}: {
  config: McpServerConfig;
  input: McpIndexedContextSearchInput;
  runtime?: McpToolRuntime;
}): Promise<McpIndexedContextSearchResult> {
  try {
    const db = runtime.db ?? getDb();
    const maxResults = getMaxResults(input.maxResults);
    const query = normalizeSearchQuery(input.query);

    await assertWorkspaceScope(db, config.workspaceIndexId);

    let chunks: RelevantChunk[] = [];

    try {
      chunks = await searchRelevantChunks({
        db,
        ...(runtime.embeddingProvider ? { embeddingProvider: runtime.embeddingProvider } : {}),
        limit: maxResults,
        query,
        sourceIds: normalizeSourceIds(input.sourceIds),
        workspaceIndexId: config.workspaceIndexId,
      });
    } catch (error: unknown) {
      if (!(error instanceof RagRetrievalError)) {
        throw error;
      }
    }

    const boundedResults = chunks.slice(0, maxResults).map(toSourceReference);
    const results = getUniqueSourceReferences(boundedResults);

    return {
      limits: {
        maxResults,
        sourceSnippetMaxCharacters,
      },
      omissions: {
        sourceReferences: Math.max(boundedResults.length - results.length, 0),
      },
      query,
      resultCount: results.length,
      results,
      workspaceIndexId: config.workspaceIndexId,
    };
  } catch (error: unknown) {
    handleMcpRuntimeError(error);
  }
}
