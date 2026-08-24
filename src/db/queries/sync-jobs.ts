import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import {
  workspaceIndexes,
  workspaceSources,
  syncableWorkspaceSourceTypes,
  syncJobs,
} from '@/db/schema';

import type { Db } from '@/db';
import type { WorkspaceSource, SyncJob } from '@/db/schema';
import type { IngestDocumentsSummary } from '@/lib/rag/ingest-documents';

export class SyncJobAlreadyRunningError extends Error {
  constructor() {
    super('A sync is already running for this source.');
  }
}

export class SyncJobLeaseLostError extends Error {
  constructor() {
    super('The sync job lease expired before the job completed.');
  }
}

/**
 * This is a cooperative operational lease, not a durable worker queue. A later
 * claim can recover a worker that has not renewed within 30 minutes, while an
 * active worker refreshes the lease at five-minute pipeline checkpoints.
 */
export const syncJobLeaseDurationMs = 30 * 60 * 1000;
export const syncJobLeaseHeartbeatIntervalMs = 5 * 60 * 1000;
export const syncJobLeaseExpiredErrorCode = 'sync-job-lease-expired';

const syncJobClaimConstraint = 'sync_jobs_one_running_per_source_unique';
const syncJobLeaseExpiredMessage =
  'The previous sync worker stopped renewing its lease before the job completed.';

export function isSyncJobClaimConflict(error: unknown): boolean {
  let currentError = error;

  for (let causeDepth = 0; causeDepth < 3; causeDepth += 1) {
    if (!currentError || typeof currentError !== 'object') {
      return false;
    }

    const constraintName =
      'constraint' in currentError && typeof currentError.constraint === 'string'
        ? currentError.constraint
        : 'constraint_name' in currentError && typeof currentError.constraint_name === 'string'
          ? currentError.constraint_name
          : null;

    if (
      'code' in currentError &&
      currentError.code === '23505' &&
      constraintName === syncJobClaimConstraint
    ) {
      return true;
    }

    currentError = 'cause' in currentError ? currentError.cause : null;
  }

  return false;
}

function resolveLeaseDurationMs(leaseDurationMs: number | undefined): number {
  if (leaseDurationMs === undefined) {
    return syncJobLeaseDurationMs;
  }

  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error('Sync job lease duration must be a positive finite number.');
  }

  return Math.trunc(leaseDurationMs);
}

function createLeaseExpiresAt(now: Date | undefined, leaseDurationMs: number | undefined) {
  const durationMs = resolveLeaseDurationMs(leaseDurationMs);

  if (now) {
    return new Date(now.getTime() + durationMs);
  }

  return sql<Date>`now() + ${durationMs} * interval '1 millisecond'`;
}

function resolveNow(now: Date | undefined) {
  return now ?? sql<Date>`now()`;
}

function requireSyncJob(row: SyncJob | undefined): SyncJob {
  if (!row) {
    throw new Error('Sync job write failed.');
  }

  return row;
}

export async function completeSyncJob(input: {
  db: Db;
  now?: Date;
  syncJobId: string;
  summary: IngestDocumentsSummary;
}): Promise<SyncJob> {
  const now = resolveNow(input.now);
  const [syncJob] = await input.db
    .update(syncJobs)
    .set({
      chunksCreated: input.summary.chunksCreated,
      completedAt: now,
      documentsCreated: input.summary.documentsCreated,
      documentsDeleted: input.summary.documentsDeleted,
      documentsFound: input.summary.documentsFound,
      documentsUpdated: input.summary.documentsUpdated,
      error: null,
      errorCode: null,
      leaseExpiresAt: null,
      skippedUnchanged: input.summary.skippedUnchanged,
      status: 'completed',
    })
    .where(
      and(
        eq(syncJobs.id, input.syncJobId),
        eq(syncJobs.status, 'running'),
        gt(syncJobs.leaseExpiresAt, now),
      ),
    )
    .returning();

  if (!syncJob) {
    throw new SyncJobLeaseLostError();
  }

  return syncJob;
}

export async function createRunningSyncJob(input: {
  db: Db;
  leaseDurationMs?: number;
  now?: Date;
  workspaceIndexId: string;
  sourceId: string;
}): Promise<SyncJob> {
  const now = resolveNow(input.now);
  const leaseExpiresAt = createLeaseExpiresAt(input.now, input.leaseDurationMs);

  try {
    return await input.db.transaction(async (tx) => {
      await tx
        .update(syncJobs)
        .set({
          completedAt: now,
          error: syncJobLeaseExpiredMessage,
          errorCode: syncJobLeaseExpiredErrorCode,
          leaseExpiresAt: null,
          status: 'failed',
        })
        .where(
          and(
            eq(syncJobs.sourceId, input.sourceId),
            eq(syncJobs.workspaceIndexId, input.workspaceIndexId),
            eq(syncJobs.status, 'running'),
            or(isNull(syncJobs.leaseExpiresAt), lte(syncJobs.leaseExpiresAt, now)),
          ),
        );

      const [syncJob] = await tx
        .insert(syncJobs)
        .values({
          leaseExpiresAt,
          sourceId: input.sourceId,
          startedAt: now,
          status: 'running',
          workspaceIndexId: input.workspaceIndexId,
        })
        .returning();

      return requireSyncJob(syncJob);
    });
  } catch (error: unknown) {
    if (isSyncJobClaimConflict(error)) {
      throw new SyncJobAlreadyRunningError();
    }

    throw error;
  }
}

export async function renewRunningSyncJobLease(input: {
  db: Db;
  leaseDurationMs?: number;
  now?: Date;
  syncJobId: string;
}): Promise<SyncJob> {
  const now = resolveNow(input.now);
  const [syncJob] = await input.db
    .update(syncJobs)
    .set({
      leaseExpiresAt: createLeaseExpiresAt(input.now, input.leaseDurationMs),
    })
    .where(
      and(
        eq(syncJobs.id, input.syncJobId),
        eq(syncJobs.status, 'running'),
        gt(syncJobs.leaseExpiresAt, now),
      ),
    )
    .returning();

  if (!syncJob) {
    throw new SyncJobLeaseLostError();
  }

  return syncJob;
}

export async function failSyncJob(input: {
  code: string;
  db: Db;
  message: string;
  now?: Date;
  syncJobId: string;
}): Promise<SyncJob> {
  const [syncJob] = await input.db
    .update(syncJobs)
    .set({
      completedAt: resolveNow(input.now),
      error: input.message,
      errorCode: input.code,
      leaseExpiresAt: null,
      status: 'failed',
    })
    .where(and(eq(syncJobs.id, input.syncJobId), eq(syncJobs.status, 'running')))
    .returning();

  if (syncJob) {
    return syncJob;
  }

  const [existingSyncJob] = await input.db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.id, input.syncJobId))
    .limit(1);

  return requireSyncJob(existingSyncJob);
}

export async function getPrimaryWorkspaceSource(input: {
  db: Db;
  workspaceIndexId: string;
}): Promise<WorkspaceSource | null> {
  const [workspaceIndex] = await input.db
    .select({ id: workspaceIndexes.id })
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, input.workspaceIndexId))
    .limit(1);

  if (!workspaceIndex) {
    return null;
  }

  const [source] = await input.db
    .select()
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.workspaceIndexId, input.workspaceIndexId),
        inArray(workspaceSources.type, syncableWorkspaceSourceTypes),
      ),
    )
    .orderBy(desc(workspaceSources.createdAt))
    .limit(1);

  return source ?? null;
}

export async function getSyncableWorkspaceSource(input: {
  db: Db;
  workspaceIndexId: string;
  sourceId: string;
}): Promise<WorkspaceSource | null> {
  const [source] = await input.db
    .select()
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.id, input.sourceId),
        eq(workspaceSources.workspaceIndexId, input.workspaceIndexId),
        inArray(workspaceSources.type, syncableWorkspaceSourceTypes),
      ),
    )
    .limit(1);

  return source ?? null;
}

export async function listSyncableWorkspaceSources(input: {
  db: Db;
  workspaceIndexId: string;
}): Promise<WorkspaceSource[]> {
  const [workspaceIndex] = await input.db
    .select({ id: workspaceIndexes.id })
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, input.workspaceIndexId))
    .limit(1);

  if (!workspaceIndex) {
    return [];
  }

  return input.db
    .select()
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.workspaceIndexId, input.workspaceIndexId),
        inArray(workspaceSources.type, syncableWorkspaceSourceTypes),
      ),
    )
    .orderBy(desc(workspaceSources.createdAt));
}

export async function updateSourceAfterSuccessfulSync(input: {
  db: Db;
  externalVersion: string | null;
  sourceId: string;
}): Promise<WorkspaceSource> {
  const [source] = await input.db
    .update(workspaceSources)
    .set({
      lastExternalVersion: input.externalVersion,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workspaceSources.id, input.sourceId))
    .returning();

  if (!source) {
    throw new Error('Source update failed.');
  }

  return source;
}
