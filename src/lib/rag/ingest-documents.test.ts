import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { documentChunks, documents, workspaceIndexes, workspaceSources } from '@/db/schema';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { ingestDocuments, isUnchangedSourceDocument } from '@/lib/rag/ingest-documents';
import { hashContent } from '@/lib/sources/hash-content';

import { and, count, eq } from 'drizzle-orm';

import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { SourceDocument } from '@/lib/sources/types';
import type { Db } from '@/db';

class DeterministicEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  inputs: string[] = [];
  model = supportedEmbeddingModel;

  async createEmbedding(input: string): Promise<number[]> {
    this.inputs.push(input);

    return Array.from({ length: expectedEmbeddingDimensions }, (_, index) =>
      index === 0 ? input.length : 0,
    );
  }
}

class TrackingEmbeddingProvider implements EmbeddingProvider {
  activeEmbeddings = 0;
  dimensions = expectedEmbeddingDimensions;
  inputs: string[] = [];
  maxActiveEmbeddings = 0;
  model = supportedEmbeddingModel;

  async createEmbedding(input: string): Promise<number[]> {
    this.activeEmbeddings += 1;
    this.inputs.push(input);
    this.maxActiveEmbeddings = Math.max(this.maxActiveEmbeddings, this.activeEmbeddings);

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    this.activeEmbeddings -= 1;

    return Array.from({ length: expectedEmbeddingDimensions }, (_, index) =>
      index === 0 ? input.length : 0,
    );
  }
}

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function createSourceDocument(input: {
  content: string;
  path: string;
  title: string;
}): SourceDocument {
  return {
    content: input.content,
    contentHash: hashContent(input.content),
    externalId: `github:openai/openai-cookbook:main:${input.path}`,
    metadata: {
      branch: 'main',
      path: input.path,
      sourceType: 'github',
    },
    path: input.path,
    title: input.title,
  };
}

describe('isUnchangedSourceDocument', () => {
  it('compares source identity and content hash', () => {
    const sourceDocument = createSourceDocument({
      content: '# A\n\nSame content.',
      path: 'a.md',
      title: 'A',
    });

    expect(
      isUnchangedSourceDocument(
        {
          contentHash: sourceDocument.contentHash,
          externalId: sourceDocument.externalId,
        },
        sourceDocument,
      ),
    ).toBe(true);
    expect(
      isUnchangedSourceDocument(
        {
          contentHash: 'different',
          externalId: sourceDocument.externalId,
        },
        sourceDocument,
      ),
    ).toBe(false);
  });
});

describeWithDatabase('ingestDocuments', () => {
  let db: Db | null = null;
  let workspaceIndexId: string | null = null;
  let sourceId: string | null = null;

  beforeEach(async () => {
    db = getDb();

    const [workspaceIndex] = await db
      .insert(workspaceIndexes)
      .values({
        description: 'temporary ingestion test',
        name: 'Ingestion Test KB',
      })
      .returning();

    if (!workspaceIndex) {
      throw new Error('Failed to create test workspace index.');
    }

    const [source] = await db
      .insert(workspaceSources)
      .values({
        config: {
          branch: 'main',
          owner: 'openai',
          repo: 'openai-cookbook',
          repoUrl: 'https://github.com/openai/openai-cookbook',
        },
        name: 'openai/openai-cookbook',
        type: 'github',
        workspaceIndexId: workspaceIndex.id,
      })
      .returning();

    if (!source) {
      throw new Error('Failed to create test source.');
    }

    workspaceIndexId = workspaceIndex.id;
    sourceId = source.id;
  });

  afterEach(async () => {
    if (db && workspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
    }

    db = null;
    workspaceIndexId = null;
    sourceId = null;
  });

  it('creates, skips unchanged, updates changed, and deletes removed documents', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const firstDocuments = [
      createSourceDocument({
        content: '# Alpha\n\nAlpha content for ingestion.',
        path: 'alpha.md',
        title: 'Alpha',
      }),
      createSourceDocument({
        content: '# Beta\n\nBeta content for ingestion.',
        path: 'beta.md',
        title: 'Beta',
      }),
    ];
    const firstProvider = new DeterministicEmbeddingProvider();

    await expect(
      ingestDocuments({
        documents: firstDocuments,
        embeddingProvider: firstProvider,
        sourceId,
        sourceType: 'github',
        workspaceIndexId,
      }),
    ).resolves.toEqual({
      chunksCreated: 2,
      documentsCreated: 2,
      documentsDeleted: 0,
      documentsFound: 2,
      documentsUpdated: 0,
      skippedUnchanged: 0,
    });

    const [firstChunkCount] = await db
      .select({ value: count(documentChunks.id) })
      .from(documentChunks)
      .where(eq(documentChunks.sourceId, sourceId));
    const [firstChunk] = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.sourceId, sourceId))
      .limit(1);

    expect(firstChunkCount?.value).toBe(2);
    expect(firstChunk?.embedding).toHaveLength(expectedEmbeddingDimensions);

    const unchangedProvider = new DeterministicEmbeddingProvider();

    await expect(
      ingestDocuments({
        documents: firstDocuments,
        embeddingProvider: unchangedProvider,
        sourceId,
        sourceType: 'github',
        workspaceIndexId,
      }),
    ).resolves.toEqual({
      chunksCreated: 0,
      documentsCreated: 0,
      documentsDeleted: 0,
      documentsFound: 2,
      documentsUpdated: 0,
      skippedUnchanged: 2,
    });
    expect(unchangedProvider.inputs).toHaveLength(0);

    const modifiedAlpha = createSourceDocument({
      content: '# Alpha\n\nAlpha content changed for ingestion.',
      path: 'alpha.md',
      title: 'Alpha',
    });
    const updateProvider = new DeterministicEmbeddingProvider();

    await expect(
      ingestDocuments({
        documents: [modifiedAlpha],
        embeddingProvider: updateProvider,
        sourceId,
        sourceType: 'github',
        workspaceIndexId,
      }),
    ).resolves.toEqual({
      chunksCreated: 1,
      documentsCreated: 0,
      documentsDeleted: 1,
      documentsFound: 1,
      documentsUpdated: 1,
      skippedUnchanged: 0,
    });

    const [remainingDocumentCount] = await db
      .select({ value: count(documents.id) })
      .from(documents)
      .where(eq(documents.sourceId, sourceId));
    const [remainingAlpha] = await db
      .select()
      .from(documents)
      .where(
        and(eq(documents.sourceId, sourceId), eq(documents.externalId, modifiedAlpha.externalId)),
      )
      .limit(1);

    expect(remainingDocumentCount?.value).toBe(1);
    expect(remainingAlpha?.contentHash).toBe(modifiedAlpha.contentHash);
    expect(updateProvider.inputs).toHaveLength(1);
  });

  it('reports aggregate progress without exposing document content', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const progressEvents: unknown[] = [];
    const sourceDocuments = [
      createSourceDocument({
        content: '# Alpha\n\nAlpha content for progress.',
        path: 'progress-alpha.md',
        title: 'Progress Alpha',
      }),
      createSourceDocument({
        content: '# Beta\n\nBeta content for progress.',
        path: 'progress-beta.md',
        title: 'Progress Beta',
      }),
    ];

    await ingestDocuments({
      documents: sourceDocuments,
      embeddingProvider: new DeterministicEmbeddingProvider(),
      onProgress: (progress) => {
        progressEvents.push(progress);
      },
      sourceId,
      sourceType: 'github',
      workspaceIndexId,
    });

    expect(progressEvents).toEqual([
      {
        chunksCreated: 0,
        documentsCreated: 0,
        documentsDeleted: 0,
        documentsFound: 2,
        documentsUpdated: 0,
        processedDocuments: 0,
        skippedUnchanged: 0,
      },
      {
        chunksCreated: 1,
        documentsCreated: 1,
        documentsDeleted: 0,
        documentsFound: 2,
        documentsUpdated: 0,
        processedDocuments: 1,
        skippedUnchanged: 0,
      },
      {
        chunksCreated: 2,
        documentsCreated: 2,
        documentsDeleted: 0,
        documentsFound: 2,
        documentsUpdated: 0,
        processedDocuments: 2,
        skippedUnchanged: 0,
      },
      {
        chunksCreated: 2,
        documentsCreated: 2,
        documentsDeleted: 0,
        documentsFound: 2,
        documentsUpdated: 0,
        processedDocuments: 2,
        skippedUnchanged: 0,
      },
    ]);
    expect(JSON.stringify(progressEvents)).not.toContain('Alpha content');
  });

  it('limits concurrent embedding requests while preserving chunk persistence', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const provider = new TrackingEmbeddingProvider();
    let heartbeatCalls = 0;
    const sections = Array.from(
      { length: 5 },
      (_value, index) => `## Section ${index + 1}\n\n${'Long chunk content. '.repeat(70)}`,
    );
    const sourceDocument = createSourceDocument({
      content: `# Large Document\n\n${sections.join('\n\n')}`,
      path: 'large-document.md',
      title: 'Large Document',
    });
    const summary = await ingestDocuments({
      documents: [sourceDocument],
      embeddingConcurrency: 2,
      embeddingProvider: provider,
      onHeartbeat: () => {
        heartbeatCalls += 1;
      },
      sourceId,
      sourceType: 'github',
      workspaceIndexId,
    });
    const [chunkCount] = await db
      .select({ value: count(documentChunks.id) })
      .from(documentChunks)
      .where(eq(documentChunks.sourceId, sourceId));

    expect(summary.chunksCreated).toBeGreaterThan(1);
    expect(chunkCount?.value).toBe(summary.chunksCreated);
    expect(provider.inputs).toHaveLength(summary.chunksCreated);
    expect(provider.maxActiveEmbeddings).toBe(2);
    expect(heartbeatCalls).toBe(summary.chunksCreated + 2);
  });

  it('can upsert a subset without deleting missing documents', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const alpha = createSourceDocument({
      content: '# Alpha\n\nAlpha content.',
      path: 'preserve-alpha.md',
      title: 'Preserve Alpha',
    });
    const beta = createSourceDocument({
      content: '# Beta\n\nBeta content.',
      path: 'preserve-beta.md',
      title: 'Preserve Beta',
    });

    await ingestDocuments({
      documents: [alpha, beta],
      embeddingProvider: new DeterministicEmbeddingProvider(),
      sourceId,
      sourceType: 'github',
      workspaceIndexId,
    });

    await expect(
      ingestDocuments({
        deleteMissingDocuments: false,
        documents: [
          createSourceDocument({
            content: '# Alpha\n\nAlpha content changed.',
            path: 'preserve-alpha.md',
            title: 'Preserve Alpha',
          }),
        ],
        embeddingProvider: new DeterministicEmbeddingProvider(),
        sourceId,
        sourceType: 'github',
        workspaceIndexId,
      }),
    ).resolves.toMatchObject({
      documentsDeleted: 0,
      documentsFound: 1,
      documentsUpdated: 1,
    });

    const [documentCount] = await db
      .select({ value: count(documents.id) })
      .from(documents)
      .where(eq(documents.sourceId, sourceId));

    expect(documentCount?.value).toBe(2);
  });
});
