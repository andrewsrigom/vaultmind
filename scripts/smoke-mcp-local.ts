import { existsSync, readFileSync } from 'node:fs';

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { workspaceIndexes, workspaceSources } from '@/db/schema';
import {
  runMcpIndexedContextSearch,
  type McpIndexedContextSearchResult,
} from '@/lib/mcp/agent-context-tools';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { ingestDocuments } from '@/lib/rag/ingest-documents';
import { hashContent } from '@/lib/sources/hash-content';

import type { Db } from '@/db';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';

export type McpSmokeFixture = {
  sourceId: string;
  workspaceIndexId: string;
};

export const defaultMcpSmokeDatabaseUrl =
  'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';

export class StaticEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;

  async createEmbedding(input: string): Promise<number[]> {
    return Array.from({ length: expectedEmbeddingDimensions }, (_value, index) =>
      index === 0 ? input.length : 0,
    );
  }
}

export function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
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

    if (match?.[1] && match[2] !== undefined) {
      env[match[1]] = match[2].replace(/^["']|["']$/gu, '');
    }
  }

  return env;
}

export function loadLocalEnv() {
  const localEnv = readLocalEnv();

  for (const [key, value] of Object.entries(localEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export async function seedMcpSmokeContext({
  db,
  workspaceIndexId,
}: {
  db: Db;
  workspaceIndexId: string;
}): Promise<string> {
  const [source] = await db
    .insert(workspaceSources)
    .values({
      config: {
        branch: 'main',
        excludePaths: [],
        includePaths: ['architecture.md'],
        owner: 'vaultmind',
        repo: 'mcp-smoke',
        repoUrl: 'https://github.com/vaultmind/mcp-smoke',
      },
      name: 'MCP Smoke Source',
      type: 'github',
      workspaceIndexId,
    })
    .returning({ id: workspaceSources.id });

  if (!source) {
    throw new Error('Failed to create MCP smoke source.');
  }

  const content = [
    '# VaultMind architecture',
    '',
    'VaultMind normalizes connected documents before chunking and embedding them.',
    'Ask AI retrieves bounded excerpts and returns citations to the original sources.',
  ].join('\n');

  await ingestDocuments({
    db,
    documents: [
      {
        content,
        contentHash: hashContent(content),
        externalId: 'mcp-smoke:architecture',
        metadata: { sourceType: 'github' },
        path: 'docs/architecture.md',
        title: 'VaultMind architecture',
      },
    ],
    embeddingProvider: new StaticEmbeddingProvider(),
    sourceId: source.id,
    sourceType: 'github',
    workspaceIndexId,
  });

  return source.id;
}

export async function createMcpSmokeFixture(db: Db): Promise<McpSmokeFixture> {
  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'temporary MCP search smoke',
      name: `MCP Search Smoke ${Date.now()}`,
    })
    .returning({ id: workspaceIndexes.id });

  if (!workspaceIndex) {
    throw new Error('Failed to create MCP smoke workspace index.');
  }

  return {
    sourceId: await seedMcpSmokeContext({
      db,
      workspaceIndexId: workspaceIndex.id,
    }),
    workspaceIndexId: workspaceIndex.id,
  };
}

export async function cleanupMcpSmokeFixture({
  db,
  fixture,
}: {
  db: Db;
  fixture: Pick<McpSmokeFixture, 'workspaceIndexId'>;
}) {
  await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, fixture.workspaceIndexId));
}

function assertSearchResult(result: McpIndexedContextSearchResult): void {
  if (result.resultCount !== 1 || result.results[0]?.path !== 'docs/architecture.md') {
    throw new Error('MCP search did not return the expected indexed source.');
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  process.env.DATABASE_URL = process.env.DATABASE_URL?.trim() || defaultMcpSmokeDatabaseUrl;

  const db = getDb();
  const fixture = await createMcpSmokeFixture(db);

  try {
    const result = await runMcpIndexedContextSearch({
      config: { workspaceIndexId: fixture.workspaceIndexId },
      input: {
        maxResults: 4,
        query: 'How does VaultMind retrieve cited context?',
        sourceIds: [fixture.sourceId],
      },
      runtime: {
        db,
        embeddingProvider: new StaticEmbeddingProvider(),
      },
    });

    assertSearchResult(result);
    writeLine(JSON.stringify(result, null, 2));
  } finally {
    await cleanupMcpSmokeFixture({ db, fixture });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error: unknown) => {
      writeLine(`FAIL ${error instanceof Error ? error.message : 'MCP local smoke failed.'}`);
      process.exit(1);
    });
}
