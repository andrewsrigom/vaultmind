import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import {
  documents,
  documentChunks,
  knowledgeEvents,
  workspaceIndexes,
  workspaceAreaDocuments,
  workspaceAreas,
  workspaceSources,
  syncJobs,
} from '@/db/schema';
import { syncJobLeaseExpiredErrorCode } from '@/db/queries/sync-jobs';
import { upsertWorkspaceArea } from '@/db/queries/workspace-areas';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { syncWorkspaceSource } from '@/lib/rag/sync-knowledge-source';
import { SourceAdapterError } from '@/lib/sources/errors';
import { hashContent } from '@/lib/sources/hash-content';

import { asc, count, desc, eq, inArray } from 'drizzle-orm';

import type { Db } from '@/db';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { SourceAdapter, SourceDocument, SourceSyncResult } from '@/lib/sources/types';

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

class FailingSourceAdapter implements SourceAdapter {
  type = 'github' as const;

  async loadDocuments(): Promise<SourceSyncResult> {
    throw new SourceAdapterError(
      'github-no-markdown-files',
      'No Markdown files were found in this repository branch.',
      404,
    );
  }
}

class StaticSourceAdapter implements SourceAdapter {
  calls = 0;
  result: SourceSyncResult;
  type = 'github' as const;

  constructor(result: SourceSyncResult) {
    this.result = result;
  }

  async loadDocuments(): Promise<SourceSyncResult> {
    this.calls += 1;

    return this.result;
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

describeWithDatabase('syncWorkspaceSource', () => {
  let db: Db | null = null;
  let workspaceIndexId: string | null = null;
  let sourceId: string | null = null;
  let workspaceAreaIds: string[] = [];

  beforeEach(async () => {
    db = getDb();

    const [workspaceIndex] = await db
      .insert(workspaceIndexes)
      .values({
        description: 'temporary sync test',
        name: 'Sync Test KB',
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
    if (db && workspaceAreaIds.length > 0) {
      await db.delete(workspaceAreas).where(inArray(workspaceAreas.id, workspaceAreaIds));
    }

    if (db && workspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
    }

    db = null;
    workspaceIndexId = null;
    sourceId = null;
    workspaceAreaIds = [];
  });

  it('syncs documents and repeated unchanged syncs do not duplicate chunks', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const adapter = new StaticSourceAdapter({
      documents: [
        createSourceDocument({
          content: '# Alpha\n\nAlpha sync content.',
          path: 'alpha.md',
          title: 'Alpha',
        }),
      ],
      externalVersion: 'commit-one',
    });
    const firstProvider = new DeterministicEmbeddingProvider();

    await expect(
      syncWorkspaceSource({
        adapterRegistry: () => adapter,
        db,
        embeddingProvider: firstProvider,
        workspaceIndexId,
      }),
    ).resolves.toMatchObject({
      summary: {
        chunksCreated: 1,
        documentsCreated: 1,
        documentsDeleted: 0,
        documentsFound: 1,
        documentsUpdated: 0,
        skippedUnchanged: 0,
      },
      syncJob: {
        status: 'completed',
      },
    });

    const secondProvider = new DeterministicEmbeddingProvider();

    await expect(
      syncWorkspaceSource({
        adapterRegistry: () => adapter,
        db,
        embeddingProvider: secondProvider,
        workspaceIndexId,
      }),
    ).resolves.toMatchObject({
      summary: {
        chunksCreated: 0,
        documentsCreated: 0,
        documentsDeleted: 0,
        documentsFound: 1,
        documentsUpdated: 0,
        skippedUnchanged: 1,
      },
      syncJob: {
        status: 'completed',
      },
    });

    const [chunkCount] = await db
      .select({ value: count(documentChunks.id) })
      .from(documentChunks)
      .where(eq(documentChunks.sourceId, sourceId));
    const [source] = await db
      .select()
      .from(workspaceSources)
      .where(eq(workspaceSources.id, sourceId))
      .limit(1);
    const sourceSyncEvents = await db
      .select()
      .from(knowledgeEvents)
      .where(eq(knowledgeEvents.sourceId, sourceId))
      .orderBy(asc(knowledgeEvents.createdAt));

    expect(adapter.calls).toBe(2);
    expect(chunkCount?.value).toBe(1);
    expect(secondProvider.inputs).toHaveLength(0);
    expect(source?.lastExternalVersion).toBe('commit-one');
    expect(source?.lastSyncedAt).toBeInstanceOf(Date);
    expect(sourceSyncEvents.map((event) => event.type)).toEqual(['source-synced', 'source-synced']);
    expect(sourceSyncEvents[0]?.metadata).toMatchObject({
      documentsCreated: 1,
      documentsFound: 1,
    });
    expect(sourceSyncEvents[1]?.metadata).toMatchObject({
      documentsFound: 1,
      skippedUnchanged: 1,
    });
  });

  it('syncs every syncable source in the workspace index by default', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const [secondSource] = await db
      .insert(workspaceSources)
      .values({
        config: {
          branch: 'main',
          owner: 'openai',
          repo: 'second-cookbook',
          repoUrl: 'https://github.com/openai/second-cookbook',
        },
        name: 'openai/second-cookbook',
        type: 'github',
        workspaceIndexId,
      })
      .returning();

    if (!secondSource) {
      throw new Error('Failed to create second test source.');
    }

    const adapter = new StaticSourceAdapter({
      documents: [
        createSourceDocument({
          content: '# Shared\n\nShared sync content.',
          path: 'shared.md',
          title: 'Shared',
        }),
      ],
      externalVersion: 'commit-all',
    });

    await expect(
      syncWorkspaceSource({
        adapterRegistry: () => adapter,
        db,
        embeddingProvider: new DeterministicEmbeddingProvider(),
        workspaceIndexId,
      }),
    ).resolves.toMatchObject({
      summary: {
        chunksCreated: 2,
        documentsCreated: 2,
        documentsDeleted: 0,
        documentsFound: 2,
        documentsUpdated: 0,
        skippedUnchanged: 0,
      },
      syncJobs: [
        {
          status: 'completed',
        },
        {
          status: 'completed',
        },
      ],
    });

    const [chunkCount] = await db
      .select({ value: count(documentChunks.id) })
      .from(documentChunks)
      .where(eq(documentChunks.workspaceIndexId, workspaceIndexId));

    expect(adapter.calls).toBe(2);
    expect(chunkCount?.value).toBe(2);
  });

  it('syncs only the requested source when sourceId is provided', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const [secondSource] = await db
      .insert(workspaceSources)
      .values({
        config: {
          branch: 'main',
          owner: 'openai',
          repo: 'second-cookbook',
          repoUrl: 'https://github.com/openai/second-cookbook',
        },
        name: 'openai/second-cookbook',
        type: 'github',
        workspaceIndexId,
      })
      .returning();

    if (!secondSource) {
      throw new Error('Failed to create second test source.');
    }

    const adapter = new StaticSourceAdapter({
      documents: [
        createSourceDocument({
          content: '# Only first\n\nOnly first source content.',
          path: 'only-first.md',
          title: 'Only first',
        }),
      ],
      externalVersion: 'commit-one-source',
    });

    await syncWorkspaceSource({
      adapterRegistry: () => adapter,
      db,
      embeddingProvider: new DeterministicEmbeddingProvider(),
      sourceId,
      workspaceIndexId,
    });

    const [firstSourceChunkCount] = await db
      .select({ value: count(documentChunks.id) })
      .from(documentChunks)
      .where(eq(documentChunks.sourceId, sourceId));
    const [secondSourceChunkCount] = await db
      .select({ value: count(documentChunks.id) })
      .from(documentChunks)
      .where(eq(documentChunks.sourceId, secondSource.id));

    expect(adapter.calls).toBe(1);
    expect(firstSourceChunkCount?.value).toBe(1);
    expect(secondSourceChunkCount?.value).toBe(0);
  });

  it('links newly synced documents to accepted areas with an established path prefix', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const onboardingDocument = createSourceDocument({
      content: '# Onboarding\n\nPeople onboarding source content.',
      path: 'people-hr/onboarding.md',
      title: 'Onboarding',
    });
    const adapter = new StaticSourceAdapter({
      documents: [onboardingDocument],
      externalVersion: 'commit-area-one',
    });

    await syncWorkspaceSource({
      adapterRegistry: () => adapter,
      db,
      embeddingProvider: new DeterministicEmbeddingProvider(),
      sourceId,
      workspaceIndexId,
    });

    const [workspaceIndex] = await db
      .select({
        vaultId: workspaceIndexes.vaultId,
      })
      .from(workspaceIndexes)
      .where(eq(workspaceIndexes.id, workspaceIndexId))
      .limit(1);
    const [seedDocument] = await db
      .select({
        id: documents.id,
      })
      .from(documents)
      .where(eq(documents.path, 'people-hr/onboarding.md'))
      .limit(1);

    if (!workspaceIndex || !seedDocument) {
      throw new Error('Failed to load synced test document.');
    }

    const area = await upsertWorkspaceArea({
      db,
      description: 'People policies, onboarding, and employee operations.',
      documentLinks: [
        {
          confidence: 0.9,
          documentId: seedDocument.id,
          reason: 'Accepted area seed document.',
        },
      ],
      name: 'People & HR',
      origin: 'ai-discovered',
      slug: 'people-hr',
      vaultId: workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(area.id);

    adapter.result = {
      documents: [
        onboardingDocument,
        createSourceDocument({
          content: '# Onboarding gaps\n\nNorthstar does not have a 30/60/90 plan.',
          path: 'people-hr/onboarding-gaps.md',
          title: 'Onboarding gaps',
        }),
        createSourceDocument({
          content: '# Budget\n\nFinance source content.',
          path: 'finance/budget.md',
          title: 'Budget',
        }),
      ],
      externalVersion: 'commit-area-two',
    };

    await syncWorkspaceSource({
      adapterRegistry: () => adapter,
      db,
      embeddingProvider: new DeterministicEmbeddingProvider(),
      sourceId,
      workspaceIndexId,
    });

    const areaDocuments = await db
      .select({
        path: documents.path,
        reason: workspaceAreaDocuments.reason,
      })
      .from(workspaceAreaDocuments)
      .innerJoin(documents, eq(workspaceAreaDocuments.documentId, documents.id))
      .where(eq(workspaceAreaDocuments.workspaceAreaId, area.id))
      .orderBy(asc(documents.path));
    const [latestSourceSyncedEvent] = await db
      .select()
      .from(knowledgeEvents)
      .where(eq(knowledgeEvents.sourceId, sourceId))
      .orderBy(desc(knowledgeEvents.createdAt))
      .limit(1);

    expect(areaDocuments.map((document) => document.path)).toEqual([
      'people-hr/onboarding-gaps.md',
      'people-hr/onboarding.md',
    ]);
    expect(areaDocuments[0]?.reason).toContain('Auto-linked after source sync');
    expect(latestSourceSyncedEvent?.metadata).toMatchObject({
      areaDocumentsLinked: 1,
      areasScanned: expect.any(Number),
      documentsCreated: 2,
    });
  });

  it('returns sync-already-running when a source has an active job', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    await db.insert(syncJobs).values({
      leaseExpiresAt: new Date(Date.now() + 60_000),
      sourceId,
      startedAt: new Date(),
      status: 'running',
      workspaceIndexId,
    });

    await expect(
      syncWorkspaceSource({
        adapterRegistry: () =>
          new StaticSourceAdapter({
            documents: [],
          }),
        db,
        embeddingProvider: new DeterministicEmbeddingProvider(),
        workspaceIndexId,
      }),
    ).rejects.toMatchObject({
      code: 'sync-already-running',
      status: 409,
    });
  });

  it('recovers an expired job before running the source pipeline', async () => {
    if (!db || !workspaceIndexId || !sourceId) {
      throw new Error('Test database IDs were not initialized.');
    }

    const [expiredSyncJob] = await db
      .insert(syncJobs)
      .values({
        leaseExpiresAt: new Date(Date.now() - 1_000),
        sourceId,
        startedAt: new Date(Date.now() - 31 * 60 * 1_000),
        status: 'running',
        workspaceIndexId,
      })
      .returning();

    if (!expiredSyncJob) {
      throw new Error('Failed to create the expired sync job fixture.');
    }

    const result = await syncWorkspaceSource({
      adapterRegistry: () =>
        new StaticSourceAdapter({
          documents: [],
        }),
      db,
      embeddingProvider: new DeterministicEmbeddingProvider(),
      sourceId,
      workspaceIndexId,
    });
    const [recoveredSyncJob] = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.id, expiredSyncJob.id))
      .limit(1);

    expect(recoveredSyncJob).toMatchObject({
      errorCode: syncJobLeaseExpiredErrorCode,
      status: 'failed',
    });
    expect(result.syncJob.status).toBe('completed');
  });

  it('marks the sync job failed with a safe source adapter error', async () => {
    if (!db || !workspaceIndexId) {
      throw new Error('Test database IDs were not initialized.');
    }

    await expect(
      syncWorkspaceSource({
        adapterRegistry: () => new FailingSourceAdapter(),
        db,
        embeddingProvider: new DeterministicEmbeddingProvider(),
        workspaceIndexId,
      }),
    ).rejects.toMatchObject({
      code: 'github-no-markdown-files',
      status: 404,
    });

    const [latestSyncJob] = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.workspaceIndexId, workspaceIndexId))
      .orderBy(desc(syncJobs.createdAt))
      .limit(1);
    const [sourceSyncFailedEvent] = await db
      .select()
      .from(knowledgeEvents)
      .where(eq(knowledgeEvents.workspaceIndexId, workspaceIndexId))
      .orderBy(desc(knowledgeEvents.createdAt))
      .limit(1);

    expect(latestSyncJob).toMatchObject({
      errorCode: 'github-no-markdown-files',
      status: 'failed',
    });
    expect(sourceSyncFailedEvent).toMatchObject({
      sourceId,
      type: 'source-sync-failed',
    });
    expect(sourceSyncFailedEvent?.metadata).toMatchObject({
      errorCode: 'github-no-markdown-files',
      syncJobId: latestSyncJob?.id,
    });
  });
});
