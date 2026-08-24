import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { documentChunks, documents, workspaceIndexes, workspaceSources } from '@/db/schema';
import { expectedEmbeddingDimensions } from '@/lib/providers/embedding-provider';
import { getVaultDocument, listWorkspaceIndexDocuments } from '@/db/queries/documents';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function createEmbedding(): number[] {
  return Array.from({ length: expectedEmbeddingDimensions }, () => 0);
}

async function createWorkspaceIndexWithSource(db: Db, name: string) {
  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'temporary documents query test',
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

describeWithDatabase('listWorkspaceIndexDocuments', () => {
  let db: Db | null = null;
  let otherWorkspaceIndexId: string | null = null;
  let targetDocumentId: string | null = null;
  let targetVaultId: string | null = null;
  let targetWorkspaceIndexId: string | null = null;
  let targetSourceId: string | null = null;

  beforeEach(async () => {
    db = getDb();

    const target = await createWorkspaceIndexWithSource(db, 'Target Documents KB');
    const other = await createWorkspaceIndexWithSource(db, 'Other Documents KB');

    targetWorkspaceIndexId = target.workspaceIndex.id;
    targetVaultId = target.workspaceIndex.vaultId;
    targetSourceId = target.source.id;
    otherWorkspaceIndexId = other.workspaceIndex.id;

    const [targetDocument] = await db
      .insert(documents)
      .values({
        content: '# Target\n\nTarget content.',
        contentHash: 'target-hash',
        externalId: 'github:openai/openai-cookbook:main:target.md',
        path: 'target.md',
        sourceId: target.source.id,
        sourceType: 'github',
        title: 'Target',
        workspaceIndexId: target.workspaceIndex.id,
      })
      .returning();
    const [otherDocument] = await db
      .insert(documents)
      .values({
        content: '# Other\n\nOther content.',
        contentHash: 'other-hash',
        externalId: 'github:openai/openai-cookbook:main:other.md',
        path: 'other.md',
        sourceId: other.source.id,
        sourceType: 'github',
        title: 'Other',
        workspaceIndexId: other.workspaceIndex.id,
      })
      .returning();

    if (!targetDocument || !otherDocument) {
      throw new Error('Failed to create test documents.');
    }

    targetDocumentId = targetDocument.id;

    await db.insert(documentChunks).values([
      {
        chunkIndex: 0,
        content: 'Target chunk one',
        documentId: targetDocument.id,
        embedding: createEmbedding(),
        sourceId: target.source.id,
        tokenEstimate: 4,
        workspaceIndexId: target.workspaceIndex.id,
      },
      {
        chunkIndex: 1,
        content: 'Target chunk two',
        documentId: targetDocument.id,
        embedding: createEmbedding(),
        sourceId: target.source.id,
        tokenEstimate: 4,
        workspaceIndexId: target.workspaceIndex.id,
      },
      {
        chunkIndex: 0,
        content: 'Other chunk',
        documentId: otherDocument.id,
        embedding: createEmbedding(),
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

    db = null;
    otherWorkspaceIndexId = null;
    targetWorkspaceIndexId = null;
    targetSourceId = null;
    targetDocumentId = null;
    targetVaultId = null;
  });

  it('returns documents scoped to one workspace index with chunk counts', async () => {
    if (!db || !targetWorkspaceIndexId) {
      throw new Error('Test database was not initialized.');
    }

    await expect(
      listWorkspaceIndexDocuments({
        db,
        workspaceIndexId: targetWorkspaceIndexId,
      }),
    ).resolves.toMatchObject([
      {
        chunkCount: 2,
        contentHash: 'target-hash',
        path: 'target.md',
        sourceName: 'openai/openai-cookbook',
        sourceType: 'github',
        title: 'Target',
      },
    ]);
  });

  it('returns one document scoped to the owning vault', async () => {
    if (!db || !targetDocumentId || !targetVaultId) {
      throw new Error('Test database was not initialized.');
    }

    await expect(
      getVaultDocument({
        db,
        documentId: targetDocumentId,
        vaultId: targetVaultId,
      }),
    ).resolves.toMatchObject({
      content: '# Target\n\nTarget content.',
      id: targetDocumentId,
      path: 'target.md',
      sourceName: 'openai/openai-cookbook',
      sourceType: 'github',
      title: 'Target',
    });
    await expect(
      getVaultDocument({
        db,
        documentId: targetDocumentId,
        vaultId: '00000000-0000-4000-8000-000000000999',
      }),
    ).resolves.toBeNull();
  });

  it('filters documents by source within the selected workspace index', async () => {
    if (!db || !targetWorkspaceIndexId || !targetSourceId) {
      throw new Error('Test database was not initialized.');
    }

    const [secondSource] = await db
      .insert(workspaceSources)
      .values({
        config: {
          branch: 'main',
          includePaths: ['second'],
          owner: 'northstar',
          repo: 'internal-handbook',
          repoUrl: 'https://github.com/northstar/internal-handbook',
        },
        name: 'northstar/internal-handbook',
        type: 'github',
        workspaceIndexId: targetWorkspaceIndexId,
      })
      .returning();

    if (!secondSource) {
      throw new Error('Failed to create second source.');
    }

    const [secondDocument] = await db
      .insert(documents)
      .values({
        content: '# Second\n\nSecond source content.',
        contentHash: 'second-hash',
        externalId: 'github:northstar/internal-handbook:main:second.md',
        path: 'second.md',
        sourceId: secondSource.id,
        sourceType: 'github',
        title: 'Second',
        workspaceIndexId: targetWorkspaceIndexId,
      })
      .returning();

    if (!secondDocument) {
      throw new Error('Failed to create second document.');
    }

    await db.insert(documentChunks).values({
      chunkIndex: 0,
      content: 'Second chunk',
      documentId: secondDocument.id,
      embedding: createEmbedding(),
      sourceId: secondSource.id,
      tokenEstimate: 3,
      workspaceIndexId: targetWorkspaceIndexId,
    });

    await expect(
      listWorkspaceIndexDocuments({
        db,
        sourceId: secondSource.id,
        workspaceIndexId: targetWorkspaceIndexId,
      }),
    ).resolves.toMatchObject([
      {
        chunkCount: 1,
        path: 'second.md',
        sourceId: secondSource.id,
        sourceName: 'northstar/internal-handbook',
        sourceType: 'github',
        title: 'Second',
      },
    ]);

    await expect(
      listWorkspaceIndexDocuments({
        db,
        sourceId: targetSourceId,
        workspaceIndexId: targetWorkspaceIndexId,
      }),
    ).resolves.toMatchObject([
      {
        path: 'target.md',
        sourceId: targetSourceId,
        sourceName: 'openai/openai-cookbook',
      },
    ]);
  });
});
