import { existsSync, readFileSync } from 'node:fs';

import { and, desc, eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { documents, sourceCredentials, workspaceSources } from '@/db/schema';
import { getSourceCredentialSecret } from '@/db/queries/source-credentials';
import { createLogger } from '@/lib/logger';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { generateEphemeralAnswer } from '@/lib/rag/generate-answer';
import { syncWorkspaceSource } from '@/lib/rag/sync-knowledge-source';
import { createNotionSourceAdapter } from '@/lib/sources/notion/notion-source-adapter';
import { notionSourceConfigSchema } from '@/lib/validators/source';

import type { ChatProvider, ChatProviderMessage } from '@/lib/providers/chat-provider';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { SourceDocument } from '@/lib/sources/types';

type SmokeSummary = {
  chunksCreated: number;
  documentsCreated: number;
  documentsDeleted: number;
  documentsFound: number;
  documentsUpdated: number;
  skippedUnchanged: number;
};

type SmokeResult = {
  answerCitationVerified: true;
  initialSyncCompleted: true;
  repeatSyncHadNoWrites: boolean;
  resourceListingCompleted: true;
  sourcePathShape: string | null;
  sourceType: string | null;
};

const defaultDatabaseUrl = 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';
const smokeQuestion =
  process.env.SMOKE_NOTION_QUESTION?.trim() ||
  'What useful context is available in the connected Notion source?';

const logger = createLogger('smoke-notion-connected');

class StaticEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;

  async createEmbedding(): Promise<number[]> {
    return Array.from({ length: expectedEmbeddingDimensions }, (_value, index) =>
      index === 0 ? 1 : 0,
    );
  }
}

class SmokeChatProvider implements ChatProvider {
  messages: ChatProviderMessage[] = [];
  model = 'smoke-chat-model';

  async generateText(messages: readonly ChatProviderMessage[]): Promise<string> {
    this.messages = messages.map((message) => ({ ...message }));

    return 'Smoke answer cites the connected Notion source. [1]';
  }

  async *streamText(messages: readonly ChatProviderMessage[]): AsyncIterable<string> {
    yield await this.generateText(messages);
  }
}

function writeLine(message: string) {
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

function getSafePathShape(path: string | undefined): string | null {
  if (!path) {
    return null;
  }

  return path.startsWith('notion/') ? 'notion/*.md' : 'non-notion-path';
}

function hasNoSyncWrites(summary: SmokeSummary): boolean {
  return (
    summary.documentsCreated === 0 &&
    summary.documentsDeleted === 0 &&
    summary.documentsUpdated === 0
  );
}

async function getConnectedNotionSource() {
  const db = getDb();
  const sourceId = process.env.SMOKE_NOTION_SOURCE_ID?.trim();
  const whereConditions = [eq(workspaceSources.type, 'notion')];

  if (sourceId) {
    whereConditions.push(eq(workspaceSources.id, sourceId));
  }

  const [row] = await db
    .select({
      source: workspaceSources,
    })
    .from(workspaceSources)
    .innerJoin(sourceCredentials, eq(sourceCredentials.sourceId, workspaceSources.id))
    .where(and(...whereConditions))
    .orderBy(desc(workspaceSources.createdAt))
    .limit(1);

  if (!row) {
    throw new Error('No connected Notion source with encrypted credentials was found.');
  }

  return row;
}

async function assertNoRemoteContentDrift(input: {
  documents: SourceDocument[];
  sourceId: string;
  workspaceIndexId: string;
}) {
  const db = getDb();
  const rows = await db
    .select({
      contentHash: documents.contentHash,
      externalId: documents.externalId,
    })
    .from(documents)
    .where(
      and(
        eq(documents.sourceId, input.sourceId),
        eq(documents.workspaceIndexId, input.workspaceIndexId),
      ),
    );
  const storedHashByExternalId = new Map(
    rows.map((row) => [row.externalId, row.contentHash] as const),
  );
  const changedDocuments = input.documents.filter(
    (document) => storedHashByExternalId.get(document.externalId) !== document.contentHash,
  );

  if (changedDocuments.length === 0) {
    return;
  }

  if (process.env.SMOKE_NOTION_ALLOW_REINDEX === '1') {
    return;
  }

  throw new Error(
    `Notion remote content differs for ${changedDocuments.length} document(s). ` +
      'Run normal sync with real embeddings first, or set SMOKE_NOTION_ALLOW_REINDEX=1 intentionally.',
  );
}

async function main(): Promise<void> {
  loadLocalEnv();
  process.env.DATABASE_URL = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;

  const db = getDb();
  const { source } = await getConnectedNotionSource();
  notionSourceConfigSchema.parse(source.config);
  const credential = await getSourceCredentialSecret({
    db,
    sourceId: source.id,
  });

  if (!credential) {
    throw new Error('Connected Notion source is missing encrypted credentials.');
  }

  const adapter = createNotionSourceAdapter();
  if (adapter.listResources) {
    await adapter.listResources({ credential });
  }

  const loaded = await adapter.loadDocuments(source.config, { credential });

  await assertNoRemoteContentDrift({
    documents: loaded.documents,
    sourceId: source.id,
    workspaceIndexId: source.workspaceIndexId,
  });

  await syncWorkspaceSource({
    adapterRegistry: () => adapter,
    db,
    embeddingProvider: new StaticEmbeddingProvider(),
    sourceId: source.id,
    workspaceIndexId: source.workspaceIndexId,
  });
  const repeatSyncResult = await syncWorkspaceSource({
    adapterRegistry: () => adapter,
    db,
    embeddingProvider: new StaticEmbeddingProvider(),
    sourceId: source.id,
    workspaceIndexId: source.workspaceIndexId,
  });
  const answer = await generateEphemeralAnswer({
    chatProvider: new SmokeChatProvider(),
    db,
    embeddingProvider: new StaticEmbeddingProvider(),
    question: smokeQuestion,
    workspaceIndexId: source.workspaceIndexId,
  });

  const sourceReference = answer.sources.find((candidate) => candidate.sourceType === 'notion');

  if (!sourceReference) {
    throw new Error('Ask AI smoke did not cite the connected Notion source.');
  }

  const result: SmokeResult = {
    answerCitationVerified: true,
    initialSyncCompleted: true,
    repeatSyncHadNoWrites: hasNoSyncWrites(repeatSyncResult.summary),
    resourceListingCompleted: true,
    sourcePathShape: getSafePathShape(sourceReference.path),
    sourceType: sourceReference.sourceType,
  };

  writeLine(JSON.stringify(result, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error('Notion connected smoke failed.', error, {
      operation: 'smoke-notion-connected',
    });
    writeLine('FAIL notion-connected-smoke-failed');
    process.exit(1);
  });
