import { getDb } from '@/db';
import { createWorkspaceIndexEvent } from '@/db/queries/knowledge-events';
import { getSourceCredentialSecret, SourceCredentialError } from '@/db/queries/source-credentials';
import {
  refreshWorkspaceAreaDocumentLinks,
  type RefreshWorkspaceAreaDocumentLinksSummary,
} from '@/db/queries/workspace-areas';
import {
  completeSyncJob,
  createRunningSyncJob,
  failSyncJob,
  getSyncableWorkspaceSource,
  listSyncableWorkspaceSources,
  renewRunningSyncJobLease,
  syncJobLeaseHeartbeatIntervalMs,
  SyncJobAlreadyRunningError,
  SyncJobLeaseLostError,
  updateSourceAfterSuccessfulSync,
} from '@/db/queries/sync-jobs';
import { createLogger } from '@/lib/logger';
import { EmbeddingProviderError } from '@/lib/providers/embedding-provider';
import { ingestDocuments, RagIngestionError } from '@/lib/rag/ingest-documents';
import { SourceAdapterError } from '@/lib/sources/errors';
import { getSourceAdapter } from '@/lib/sources/registry';
import { isSyncSourceType } from '@/lib/sources/types';

import type { Db } from '@/db';
import type { WorkspaceSource, SyncJob } from '@/db/schema';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { IngestDocumentsProgress, IngestDocumentsSummary } from '@/lib/rag/ingest-documents';
import type { SourceAdapter, SyncSourceType } from '@/lib/sources/types';

const logger = createLogger('sync-knowledge-source');

const emptyAreaRefreshSummary: RefreshWorkspaceAreaDocumentLinksSummary = {
  areasScanned: 0,
  documentsLinked: 0,
};

export type SyncWorkspaceSourceInput = {
  adapterRegistry?: (sourceType: SyncSourceType) => SourceAdapter;
  db?: Db;
  embeddingProvider?: EmbeddingProvider;
  workspaceIndexId: string;
  onProgress?: (progress: SyncWorkspaceSourceProgress) => Promise<void> | void;
  sourceId?: string;
};

export type SyncWorkspaceSourceResult = {
  summary: IngestDocumentsSummary;
  syncJob: SyncJob;
  syncJobs: SyncJob[];
};

export type SyncWorkspaceSourceProgress =
  | {
      phase: 'starting';
      syncJob: SyncJob | null;
    }
  | {
      phase: 'loading';
      syncJob: SyncJob;
    }
  | {
      documentCount: number;
      phase: 'loaded';
      syncJob: SyncJob;
    }
  | {
      phase: 'indexing';
      progress: IngestDocumentsProgress;
      syncJob: SyncJob;
    }
  | {
      phase: 'completed';
      summary: IngestDocumentsSummary;
      syncJob: SyncJob;
    };

export type SyncWorkspaceSourceErrorCode =
  | 'duplicate-source-document'
  | 'embedding-config-error'
  | 'embedding-dimension-mismatch'
  | 'embedding-provider-error'
  | 'ingestion-failed'
  | 'source-not-configured'
  | SourceCredentialError['code']
  | 'sync-already-running'
  | 'sync-lease-lost'
  | SourceAdapterError['code'];

export class SyncWorkspaceSourceError extends Error {
  code: SyncWorkspaceSourceErrorCode;
  status: number;

  constructor(code: SyncWorkspaceSourceErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function toSafeSyncError(error: unknown): SyncWorkspaceSourceError {
  if (error instanceof SyncWorkspaceSourceError) {
    return error;
  }

  if (error instanceof SyncJobAlreadyRunningError) {
    return new SyncWorkspaceSourceError(
      'sync-already-running',
      'A sync is already running for this source.',
      409,
    );
  }

  if (error instanceof SyncJobLeaseLostError) {
    return new SyncWorkspaceSourceError(
      'sync-lease-lost',
      'The sync lease expired before the job completed. Retry the sync.',
      409,
    );
  }

  if (error instanceof SourceAdapterError) {
    return new SyncWorkspaceSourceError(error.code, error.message, error.status);
  }

  if (error instanceof SourceCredentialError) {
    return new SyncWorkspaceSourceError(error.code, error.message, error.status);
  }

  if (error instanceof EmbeddingProviderError) {
    const message =
      error.code === 'embedding-config-error'
        ? 'Set OPENAI_API_KEY before syncing documents.'
        : 'Embedding generation failed. Check OpenAI access and try syncing again.';

    return new SyncWorkspaceSourceError(error.code, message, 502);
  }

  if (error instanceof RagIngestionError) {
    const code =
      error.code === 'duplicate-source-document' ? 'duplicate-source-document' : 'ingestion-failed';

    return new SyncWorkspaceSourceError(
      code,
      'Ingestion failed while processing normalized documents.',
      500,
    );
  }

  return new SyncWorkspaceSourceError(
    'ingestion-failed',
    'Sync failed unexpectedly. Check the source configuration, OpenAI access, and local database, then try again.',
    500,
  );
}

function createEmptySummary(): IngestDocumentsSummary {
  return {
    chunksCreated: 0,
    documentsCreated: 0,
    documentsDeleted: 0,
    documentsFound: 0,
    documentsUpdated: 0,
    skippedUnchanged: 0,
  };
}

function mergeSummaries(
  current: IngestDocumentsSummary,
  next: IngestDocumentsSummary,
): IngestDocumentsSummary {
  return {
    chunksCreated: current.chunksCreated + next.chunksCreated,
    documentsCreated: current.documentsCreated + next.documentsCreated,
    documentsDeleted: current.documentsDeleted + next.documentsDeleted,
    documentsFound: current.documentsFound + next.documentsFound,
    documentsUpdated: current.documentsUpdated + next.documentsUpdated,
    skippedUnchanged: current.skippedUnchanged + next.skippedUnchanged,
  };
}

async function createSourceSyncedEvent({
  areaRefreshSummary,
  db,
  sourceId,
  summary,
  syncJob,
  workspaceIndexId,
}: {
  areaRefreshSummary: RefreshWorkspaceAreaDocumentLinksSummary;
  db: Db;
  workspaceIndexId: string;
  sourceId: string;
  summary: IngestDocumentsSummary;
  syncJob: SyncJob;
}) {
  await createWorkspaceIndexEvent({
    db,
    metadata: {
      areaDocumentsLinked: areaRefreshSummary.documentsLinked,
      areasScanned: areaRefreshSummary.areasScanned,
      chunksCreated: summary.chunksCreated,
      documentsCreated: summary.documentsCreated,
      documentsDeleted: summary.documentsDeleted,
      documentsFound: summary.documentsFound,
      documentsUpdated: summary.documentsUpdated,
      skippedUnchanged: summary.skippedUnchanged,
      syncJobId: syncJob.id,
    },
    sourceId,
    type: 'source-synced',
    workspaceIndexId,
  });
}

function shouldRefreshAreaDocumentLinks(summary: IngestDocumentsSummary): boolean {
  return (
    summary.documentsCreated > 0 || summary.documentsUpdated > 0 || summary.documentsDeleted > 0
  );
}

async function createSourceSyncFailedEvent({
  db,
  errorCode,
  sourceId,
  syncJob,
  workspaceIndexId,
}: {
  db: Db;
  errorCode: SyncWorkspaceSourceErrorCode;
  workspaceIndexId: string;
  sourceId: string;
  syncJob: SyncJob;
}) {
  await createWorkspaceIndexEvent({
    db,
    metadata: {
      errorCode,
      syncJobId: syncJob.id,
    },
    sourceId,
    type: 'source-sync-failed',
    workspaceIndexId,
  });
}

async function syncSingleWorkspaceSource({
  adapterRegistry,
  db,
  embeddingProvider,
  onProgress,
  source,
  workspaceIndexId,
}: {
  adapterRegistry: (sourceType: SyncSourceType) => SourceAdapter;
  db: Db;
  embeddingProvider?: EmbeddingProvider;
  workspaceIndexId: string;
  onProgress?: (progress: SyncWorkspaceSourceProgress) => Promise<void> | void;
  source: WorkspaceSource;
}): Promise<SyncWorkspaceSourceResult> {
  if (!isSyncSourceType(source.type)) {
    throw new SyncWorkspaceSourceError(
      'source-not-configured',
      'No syncable source is configured for this workspace.',
      409,
    );
  }

  let runningSyncJob: SyncJob;

  try {
    runningSyncJob = await createRunningSyncJob({
      db,
      sourceId: source.id,
      workspaceIndexId,
    });
    await onProgress?.({
      phase: 'loading',
      syncJob: runningSyncJob,
    });
  } catch (error: unknown) {
    throw toSafeSyncError(error);
  }

  let lastLeaseHeartbeatAt = Date.now();
  let leaseHeartbeatPromise: Promise<void> | null = null;

  async function heartbeatSyncJobLease(force = false): Promise<void> {
    const now = Date.now();

    if (!force && now - lastLeaseHeartbeatAt < syncJobLeaseHeartbeatIntervalMs) {
      return;
    }

    if (!leaseHeartbeatPromise) {
      const heartbeat = renewRunningSyncJobLease({
        db,
        syncJobId: runningSyncJob.id,
      }).then((syncJob) => {
        lastLeaseHeartbeatAt = Date.now();
        runningSyncJob = syncJob;
      });

      leaseHeartbeatPromise = heartbeat.finally(() => {
        leaseHeartbeatPromise = null;
      });
    }

    await leaseHeartbeatPromise;
  }

  try {
    const adapter = adapterRegistry(source.type);
    const credential = await getSourceCredentialSecret({
      db,
      sourceId: source.id,
    });
    const syncResult = await adapter.loadDocuments(source.config, {
      ...(credential ? { credential } : {}),
    });
    await heartbeatSyncJobLease(true);
    await onProgress?.({
      documentCount: syncResult.documents.length,
      phase: 'loaded',
      syncJob: runningSyncJob,
    });
    const summary = await ingestDocuments({
      db,
      documents: syncResult.documents,
      ...(embeddingProvider ? { embeddingProvider } : {}),
      onHeartbeat: heartbeatSyncJobLease,
      onProgress: async (progress) => {
        await onProgress?.({
          phase: 'indexing',
          progress,
          syncJob: runningSyncJob,
        });
      },
      sourceId: source.id,
      sourceType: source.type,
      workspaceIndexId,
    });
    await heartbeatSyncJobLease(true);

    await updateSourceAfterSuccessfulSync({
      db,
      externalVersion: syncResult.externalVersion ?? null,
      sourceId: source.id,
    });
    let areaRefreshSummary = emptyAreaRefreshSummary;

    if (shouldRefreshAreaDocumentLinks(summary)) {
      try {
        areaRefreshSummary = await refreshWorkspaceAreaDocumentLinks({
          db,
          workspaceIndexId,
        });
      } catch (areaRefreshError: unknown) {
        logger.error(
          'Failed to refresh workspace area document links after sync.',
          areaRefreshError,
          {
            sourceId: source.id,
            workspaceIndexId,
          },
        );
      }
    }

    await heartbeatSyncJobLease(true);
    const syncJob = await completeSyncJob({
      db,
      summary,
      syncJobId: runningSyncJob.id,
    });
    try {
      await createSourceSyncedEvent({
        areaRefreshSummary,
        db,
        sourceId: source.id,
        summary,
        syncJob,
        workspaceIndexId,
      });
    } catch (eventError: unknown) {
      logger.error('Failed to record source sync event.', eventError, {
        sourceId: source.id,
        syncJobId: syncJob.id,
        workspaceIndexId,
      });
    }
    await onProgress?.({
      phase: 'completed',
      summary,
      syncJob,
    });

    return {
      summary,
      syncJob,
      syncJobs: [syncJob],
    };
  } catch (error: unknown) {
    const safeError = toSafeSyncError(error);

    const failedSyncJob = await failSyncJob({
      code: safeError.code,
      db,
      message: safeError.message,
      syncJobId: runningSyncJob.id,
    });
    try {
      await createSourceSyncFailedEvent({
        db,
        errorCode: safeError.code,
        sourceId: source.id,
        syncJob: failedSyncJob,
        workspaceIndexId,
      });
    } catch (eventError: unknown) {
      logger.error('Failed to record source sync failure event.', eventError, {
        sourceId: source.id,
        syncJobId: failedSyncJob.id,
        workspaceIndexId,
      });
    }

    throw safeError;
  }
}

export async function syncWorkspaceSource({
  adapterRegistry = getSourceAdapter,
  db = getDb(),
  embeddingProvider,
  onProgress,
  sourceId,
  workspaceIndexId,
}: SyncWorkspaceSourceInput): Promise<SyncWorkspaceSourceResult> {
  await onProgress?.({
    phase: 'starting',
    syncJob: null,
  });

  const sources = sourceId
    ? [
        await getSyncableWorkspaceSource({
          db,
          sourceId,
          workspaceIndexId,
        }),
      ].filter((source): source is WorkspaceSource => source !== null)
    : await listSyncableWorkspaceSources({ db, workspaceIndexId });

  if (sources.length === 0) {
    throw new SyncWorkspaceSourceError(
      'source-not-configured',
      'No source is configured for this workspace.',
      409,
    );
  }

  const syncJobs: SyncJob[] = [];
  let summary = createEmptySummary();

  for (const source of sources) {
    const result = await syncSingleWorkspaceSource({
      adapterRegistry,
      db,
      ...(embeddingProvider ? { embeddingProvider } : {}),
      workspaceIndexId,
      ...(onProgress ? { onProgress } : {}),
      source,
    });

    summary = mergeSummaries(summary, result.summary);
    syncJobs.push(...result.syncJobs);
  }

  const latestSyncJob = syncJobs.at(-1);

  if (!latestSyncJob) {
    throw new SyncWorkspaceSourceError(
      'source-not-configured',
      'No source is configured for this workspace.',
      409,
    );
  }

  return {
    summary,
    syncJob: latestSyncJob,
    syncJobs,
  };
}
