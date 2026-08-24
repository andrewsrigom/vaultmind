import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { documentChunks, documents, workspaceIndexes, workspaceSources } from '@/db/schema';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { RagRetrievalError, searchRelevantChunks } from '@/lib/rag/search-relevant-chunks';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

class StaticEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;
  vector: number[];

  constructor(vector: number[]) {
    this.vector = vector;
  }

  async createEmbedding(): Promise<number[]> {
    return this.vector;
  }
}

function createVector(first: number, second: number): number[] {
  return Array.from({ length: expectedEmbeddingDimensions }, (_, index) => {
    if (index === 0) {
      return first;
    }

    if (index === 1) {
      return second;
    }

    return 0;
  });
}

async function createWorkspaceIndexWithSource(db: Db, name: string) {
  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'temporary retrieval test',
      name,
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

  return {
    source,
    workspaceIndex,
  };
}

describeWithDatabase('searchRelevantChunks', () => {
  let db: Db | null = null;
  let emptyWorkspaceIndexId: string | null = null;
  let otherWorkspaceIndexId: string | null = null;
  let targetWorkspaceIndexId: string | null = null;

  beforeEach(async () => {
    db = getDb();

    const target = await createWorkspaceIndexWithSource(db, 'Target Retrieval KB');
    const other = await createWorkspaceIndexWithSource(db, 'Other Retrieval KB');
    const empty = await createWorkspaceIndexWithSource(db, 'Empty Retrieval KB');

    emptyWorkspaceIndexId = empty.workspaceIndex.id;
    otherWorkspaceIndexId = other.workspaceIndex.id;
    targetWorkspaceIndexId = target.workspaceIndex.id;

    const [alphaDocument] = await db
      .insert(documents)
      .values({
        content: '# Alpha\n\nVector retrieval alpha.',
        contentHash: 'alpha-hash',
        externalId: 'github:openai/openai-cookbook:main:docs/alpha.md',
        path: 'docs/alpha.md',
        sourceId: target.source.id,
        sourceMetadata: {
          path: 'docs/alpha.md',
        },
        sourceType: 'github',
        title: 'Alpha',
        workspaceIndexId: target.workspaceIndex.id,
      })
      .returning();
    const [betaDocument] = await db
      .insert(documents)
      .values({
        content: '# Beta\n\nVector retrieval beta.',
        contentHash: 'beta-hash',
        externalId: 'github:openai/openai-cookbook:main:notes/beta.md',
        path: 'notes/beta.md',
        sourceId: target.source.id,
        sourceMetadata: {
          path: 'notes/beta.md',
        },
        sourceType: 'github',
        title: 'Beta',
        workspaceIndexId: target.workspaceIndex.id,
      })
      .returning();
    const [overviewDocument] = await db
      .insert(documents)
      .values({
        content: '# Target Retrieval KB\n\nRepository overview.',
        contentHash: 'overview-hash',
        externalId: 'github:openai/openai-cookbook:main:README.md',
        path: 'README.md',
        sourceId: target.source.id,
        sourceMetadata: {
          path: 'README.md',
        },
        sourceType: 'github',
        title: 'Target Retrieval KB',
        workspaceIndexId: target.workspaceIndex.id,
      })
      .returning();
    const [otherDocument] = await db
      .insert(documents)
      .values({
        content: '# Other\n\nThis would win without workspaceIndexId scoping.',
        contentHash: 'other-hash',
        externalId: 'github:openai/openai-cookbook:main:docs/other.md',
        path: 'docs/other.md',
        sourceId: other.source.id,
        sourceType: 'github',
        title: 'Other',
        workspaceIndexId: other.workspaceIndex.id,
      })
      .returning();

    if (!alphaDocument || !betaDocument || !overviewDocument || !otherDocument) {
      throw new Error('Failed to create test documents.');
    }

    await db.insert(documentChunks).values([
      {
        chunkIndex: 0,
        content: 'Alpha chunk',
        documentId: alphaDocument.id,
        embedding: createVector(1, 0),
        metadata: {
          tags: ['rag'],
        },
        sourceId: target.source.id,
        tokenEstimate: 3,
        workspaceIndexId: target.workspaceIndex.id,
      },
      {
        chunkIndex: 0,
        content: 'Beta chunk',
        documentId: betaDocument.id,
        embedding: createVector(0, 1),
        metadata: {
          tags: ['notes'],
        },
        sourceId: target.source.id,
        tokenEstimate: 3,
        workspaceIndexId: target.workspaceIndex.id,
      },
      {
        chunkIndex: 0,
        content: 'Repository overview chunk',
        documentId: overviewDocument.id,
        embedding: createVector(-1, 0),
        sourceId: target.source.id,
        tokenEstimate: 3,
        workspaceIndexId: target.workspaceIndex.id,
      },
      {
        chunkIndex: 0,
        content: 'Other chunk',
        documentId: otherDocument.id,
        embedding: createVector(1, 0),
        sourceId: other.source.id,
        tokenEstimate: 3,
        workspaceIndexId: other.workspaceIndex.id,
      },
    ]);
  });

  afterEach(async () => {
    if (db && targetWorkspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, targetWorkspaceIndexId));
    }

    if (db && otherWorkspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, otherWorkspaceIndexId));
    }

    if (db && emptyWorkspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, emptyWorkspaceIndexId));
    }

    db = null;
    emptyWorkspaceIndexId = null;
    otherWorkspaceIndexId = null;
    targetWorkspaceIndexId = null;
  });

  it('returns relevant chunks ordered by cosine similarity', async () => {
    if (!db || !targetWorkspaceIndexId) {
      throw new Error('Test database was not initialized.');
    }

    const results = await searchRelevantChunks({
      db,
      embeddingProvider: new StaticEmbeddingProvider(createVector(1, 0)),
      limit: 2,
      query: 'alpha',
      workspaceIndexId: targetWorkspaceIndexId,
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      content: 'Alpha chunk',
      path: 'docs/alpha.md',
      similarity: 1,
      sourceName: 'openai/openai-cookbook',
      sourceType: 'github',
      title: 'Alpha',
    });
    expect(results[1]?.title).toBe('Beta');
    expect(results[1]?.similarity).toBeCloseTo(0, 5);
  });

  it('boosts root README chunks for broad project overview questions', async () => {
    if (!db || !targetWorkspaceIndexId) {
      throw new Error('Test database was not initialized.');
    }

    const results = await searchRelevantChunks({
      db,
      embeddingProvider: new StaticEmbeddingProvider(createVector(1, 0)),
      limit: 2,
      query: 'What is this project about?',
      workspaceIndexId: targetWorkspaceIndexId,
    });

    expect(results[0]).toMatchObject({
      content: 'Repository overview chunk',
      path: 'README.md',
      title: 'Target Retrieval KB',
    });
    expect(results[1]?.title).toBe('Alpha');
  });

  it('never returns chunks from another workspace index', async () => {
    if (!db || !targetWorkspaceIndexId) {
      throw new Error('Test database was not initialized.');
    }

    const results = await searchRelevantChunks({
      db,
      embeddingProvider: new StaticEmbeddingProvider(createVector(1, 0)),
      limit: 10,
      query: 'alpha',
      workspaceIndexId: targetWorkspaceIndexId,
    });

    expect(results.map((result) => result.title)).toEqual(['Alpha', 'Beta', 'Target Retrieval KB']);
    expect(results.some((result) => result.title === 'Other')).toBe(false);
  });

  it('supports folder and tag filters', async () => {
    if (!db || !targetWorkspaceIndexId) {
      throw new Error('Test database was not initialized.');
    }

    await expect(
      searchRelevantChunks({
        db,
        embeddingProvider: new StaticEmbeddingProvider(createVector(1, 0)),
        folder: 'docs',
        query: 'alpha',
        tags: ['rag'],
        workspaceIndexId: targetWorkspaceIndexId,
      }),
    ).resolves.toMatchObject([
      {
        path: 'docs/alpha.md',
        title: 'Alpha',
      },
    ]);
  });

  it('supports updated-after filters for time-bounded retrieval', async () => {
    if (!db || !targetWorkspaceIndexId) {
      throw new Error('Test database was not initialized.');
    }

    await db
      .update(documents)
      .set({ updatedAt: new Date('2020-01-01T00:00:00.000Z') })
      .where(eq(documents.title, 'Alpha'));

    const results = await searchRelevantChunks({
      db,
      embeddingProvider: new StaticEmbeddingProvider(createVector(1, 0)),
      limit: 10,
      query: 'alpha',
      updatedAfter: new Date('2025-01-01T00:00:00.000Z'),
      workspaceIndexId: targetWorkspaceIndexId,
    });

    expect(results.map((result) => result.title)).not.toContain('Alpha');
  });

  it('throws no-relevant-chunks before generating answers when the workspace index is empty', async () => {
    if (!db || !emptyWorkspaceIndexId) {
      throw new Error('Test database was not initialized.');
    }

    await expect(
      searchRelevantChunks({
        db,
        embeddingProvider: new StaticEmbeddingProvider(createVector(1, 0)),
        query: 'anything',
        workspaceIndexId: emptyWorkspaceIndexId,
      }),
    ).rejects.toThrow(RagRetrievalError);
  });
});
