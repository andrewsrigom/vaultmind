import { and, count, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { createWorkspaceArea } from '@/db/queries/workspace-areas';
import { createWorkspaceDoc, updateWorkspaceDoc } from '@/db/queries/workspace-docs';
import {
  documentChunks,
  documents,
  vaults,
  workspaceAreaDocuments,
  workspaceAreas,
  workspaceIndexes,
  workspaceSources,
} from '@/db/schema';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import {
  indexWorkspaceDocForAskAi,
  setWorkspaceDocAskAiIncluded,
} from '@/lib/rag/index-workspace-doc';

import type { Db } from '@/db';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';

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

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('indexWorkspaceDocForAskAi', () => {
  let db: Db | null = null;
  let vaultId: string | null = null;
  let workspaceAreaId: string | null = null;
  let workspaceIndexId: string | null = null;

  beforeEach(async () => {
    db = getDb();

    const uniqueId = crypto.randomUUID();
    const [vault] = await db
      .insert(vaults)
      .values({
        description: 'temporary workspace doc Ask AI vault test',
        name: `Workspace Doc Ask AI Org ${uniqueId}`,
        slug: `workspace-doc-ask-ai-org-${uniqueId}`,
      })
      .returning();

    if (!vault) {
      throw new Error('Failed to create test vault.');
    }

    const area = await createWorkspaceArea({
      db,
      description: null,
      icon: 'folder',
      name: `Ask AI Docs Space ${crypto.randomUUID()}`,
      vaultId: vault.id,
    });
    const [workspaceIndex] = await db
      .insert(workspaceIndexes)
      .values({
        description: 'temporary workspace doc Ask AI index test',
        name: 'Workspace Doc Ask AI Index Test KB',
        vaultId: vault.id,
      })
      .returning();

    if (!workspaceIndex) {
      throw new Error('Failed to create test workspace index.');
    }

    vaultId = vault.id;
    workspaceAreaId = area.id;
    workspaceIndexId = workspaceIndex.id;
  });

  afterEach(async () => {
    if (db && workspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
    }

    if (db && workspaceAreaId) {
      await db.delete(workspaceAreas).where(eq(workspaceAreas.id, workspaceAreaId));
    }

    if (db && vaultId) {
      await db.delete(vaults).where(eq(vaults.id, vaultId));
    }

    db = null;
    vaultId = null;
    workspaceAreaId = null;
    workspaceIndexId = null;
  });

  it('indexes, refreshes, and removes an internal workspace doc for Ask AI', async () => {
    if (!db || !vaultId || !workspaceAreaId || !workspaceIndexId) {
      throw new Error('Test database was not initialized.');
    }

    const doc = await createWorkspaceDoc({
      content: '# Launch Notes\n\nInternal launch checklist for Ask AI retrieval.',
      db,
      title: 'Launch Notes',
      vaultId,
      workspaceAreaId,
    });

    if (!doc) {
      throw new Error('Expected workspace doc to be created.');
    }

    const provider = new DeterministicEmbeddingProvider();
    const included = await setWorkspaceDocAskAiIncluded({
      db,
      docId: doc.id,
      embeddingProvider: provider,
      includeInAskAi: true,
      vaultId,
    });

    expect(included?.doc.includeInAskAi).toBe(true);
    expect(included?.summary).toMatchObject({
      documentsCreated: 1,
      documentsDeleted: 0,
      documentsFound: 1,
      skippedUnchanged: 0,
    });
    expect(provider.inputs.length).toBeGreaterThan(0);

    const [workspaceDocSourceCount] = await db
      .select({ value: count(workspaceSources.id) })
      .from(workspaceSources)
      .where(
        and(
          eq(workspaceSources.workspaceIndexId, workspaceIndexId),
          eq(workspaceSources.type, 'workspace-doc'),
        ),
      );
    const [indexedDocument] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.workspaceIndexId, workspaceIndexId),
          eq(documents.externalId, `workspace-doc:${doc.id}`),
        ),
      )
      .limit(1);

    expect(workspaceDocSourceCount?.value).toBe(1);
    expect(indexedDocument).toMatchObject({
      path: expect.stringContaining('vaultmind/docs/'),
      sourceType: 'workspace-doc',
      title: 'Launch Notes',
    });

    const [areaLink] = await db
      .select()
      .from(workspaceAreaDocuments)
      .where(
        and(
          eq(workspaceAreaDocuments.documentId, included?.documentId ?? ''),
          eq(workspaceAreaDocuments.workspaceAreaId, workspaceAreaId),
        ),
      )
      .limit(1);

    expect(areaLink).toMatchObject({
      confidence: 1,
      vaultId,
    });

    const [chunkCount] = await db
      .select({ value: count(documentChunks.id) })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, included?.documentId ?? ''));

    expect(chunkCount?.value).toBeGreaterThan(0);

    const unchangedProvider = new DeterministicEmbeddingProvider();
    await expect(
      indexWorkspaceDocForAskAi({
        db,
        docId: doc.id,
        embeddingProvider: unchangedProvider,
        vaultId,
      }),
    ).resolves.toMatchObject({
      summary: {
        documentsCreated: 0,
        documentsDeleted: 0,
        documentsFound: 1,
        skippedUnchanged: 1,
      },
    });
    expect(unchangedProvider.inputs).toHaveLength(0);

    await updateWorkspaceDoc({
      content: '# Launch Notes\n\nUpdated internal checklist for Ask AI retrieval.',
      db,
      docId: doc.id,
      title: 'Launch Notes Updated',
      vaultId,
    });

    const updatedProvider = new DeterministicEmbeddingProvider();
    await expect(
      indexWorkspaceDocForAskAi({
        db,
        docId: doc.id,
        embeddingProvider: updatedProvider,
        vaultId,
      }),
    ).resolves.toMatchObject({
      summary: {
        documentsCreated: 0,
        documentsFound: 1,
        documentsUpdated: 1,
      },
    });
    expect(updatedProvider.inputs.length).toBeGreaterThan(0);

    const removed = await setWorkspaceDocAskAiIncluded({
      db,
      docId: doc.id,
      includeInAskAi: false,
      vaultId,
    });

    expect(removed?.deletedDocuments).toBe(1);
    expect(removed?.doc.includeInAskAi).toBe(false);

    const [remainingDocumentCount] = await db
      .select({ value: count(documents.id) })
      .from(documents)
      .where(eq(documents.externalId, `workspace-doc:${doc.id}`));

    expect(remainingDocumentCount?.value).toBe(0);
  });
});
