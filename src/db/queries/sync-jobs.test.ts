import { readFileSync, readdirSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import {
  completeSyncJob,
  createRunningSyncJob,
  failSyncJob,
  isSyncJobClaimConflict,
  renewRunningSyncJobLease,
  SyncJobAlreadyRunningError,
  syncJobLeaseExpiredErrorCode,
  SyncJobLeaseLostError,
} from '@/db/queries/sync-jobs';
import { syncJobs, workspaceIndexes, workspaceSources } from '@/db/schema';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db';

const syncJobClaimConstraint = 'sync_jobs_one_running_per_source_unique';
const emptySummary = {
  chunksCreated: 0,
  documentsCreated: 0,
  documentsDeleted: 0,
  documentsFound: 0,
  documentsUpdated: 0,
  skippedUnchanged: 0,
};

describe('sync job claim conflict classification', () => {
  it('matches only the one-running-per-source constraint, including wrapped errors', () => {
    expect(
      isSyncJobClaimConflict({
        code: '23505',
        constraint_name: syncJobClaimConstraint,
      }),
    ).toBe(true);
    expect(
      isSyncJobClaimConflict({
        cause: {
          code: '23505',
          constraint: syncJobClaimConstraint,
        },
      }),
    ).toBe(true);
    expect(
      isSyncJobClaimConflict({
        code: '23505',
        constraint_name: 'sync_jobs_pkey',
      }),
    ).toBe(false);
    expect(
      isSyncJobClaimConflict({
        code: '23503',
        constraint_name: syncJobClaimConstraint,
      }),
    ).toBe(false);
  });
});

describe('sync job lease migration', () => {
  it('creates the lease and single-running-job invariants in the consolidated schema', () => {
    const migrationsDirectory = new URL('../../../drizzle/migrations/', import.meta.url);
    const initialMigration = readdirSync(migrationsDirectory).find(
      (fileName) => fileName.startsWith('0000_') && fileName.endsWith('.sql'),
    );

    if (!initialMigration) {
      throw new Error('The initial migration was not found.');
    }

    const migration = readFileSync(new URL(initialMigration, migrationsDirectory), 'utf8');
    const createTableAt = migration.indexOf('CREATE TABLE "sync_jobs"');
    const leaseColumnAt = migration.indexOf('"lease_expires_at" timestamp with time zone');
    const addConstraintAt = migration.indexOf('CONSTRAINT "sync_jobs_running_has_lease_check"');
    const addUniqueIndexAt = migration.indexOf(
      'CREATE UNIQUE INDEX "sync_jobs_one_running_per_source_unique"',
    );

    expect(createTableAt).toBeGreaterThanOrEqual(0);
    expect(leaseColumnAt).toBeGreaterThan(createTableAt);
    expect(addConstraintAt).toBeGreaterThan(leaseColumnAt);
    expect(addUniqueIndexAt).toBeGreaterThan(addConstraintAt);
  });
});

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('sync job leases', () => {
  let db: Db | null = null;
  let sourceId: string | null = null;
  let workspaceIndexId: string | null = null;

  beforeEach(async () => {
    db = getDb();

    const [workspaceIndex] = await db
      .insert(workspaceIndexes)
      .values({
        description: 'temporary sync lease test',
        name: 'Sync Lease Test KB',
      })
      .returning();

    if (!workspaceIndex) {
      throw new Error('Failed to create the sync lease test workspace.');
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
      throw new Error('Failed to create the sync lease test source.');
    }

    sourceId = source.id;
    workspaceIndexId = workspaceIndex.id;
  });

  afterEach(async () => {
    if (db && workspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
    }

    db = null;
    sourceId = null;
    workspaceIndexId = null;
  });

  it('marks an expired job failed before claiming a replacement', async () => {
    if (!db || !sourceId || !workspaceIndexId) {
      throw new Error('Sync lease test IDs were not initialized.');
    }

    const claimTime = new Date('2030-01-01T00:30:00.000Z');
    const [expiredJob] = await db
      .insert(syncJobs)
      .values({
        leaseExpiresAt: new Date('2030-01-01T00:29:59.000Z'),
        sourceId,
        startedAt: new Date('2030-01-01T00:00:00.000Z'),
        status: 'running',
        workspaceIndexId,
      })
      .returning();

    if (!expiredJob) {
      throw new Error('Failed to create the expired sync job fixture.');
    }

    const replacement = await createRunningSyncJob({
      db,
      now: claimTime,
      sourceId,
      workspaceIndexId,
    });
    const [recoveredJob] = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.id, expiredJob.id))
      .limit(1);

    expect(recoveredJob).toMatchObject({
      completedAt: claimTime,
      errorCode: syncJobLeaseExpiredErrorCode,
      leaseExpiresAt: null,
      status: 'failed',
    });
    expect(replacement).toMatchObject({
      sourceId,
      status: 'running',
      workspaceIndexId,
    });
    expect(replacement.leaseExpiresAt?.getTime()).toBeGreaterThan(claimTime.getTime());
  });

  it('keeps a valid lease as the single active claim', async () => {
    if (!db || !sourceId || !workspaceIndexId) {
      throw new Error('Sync lease test IDs were not initialized.');
    }

    const claimTime = new Date('2030-01-01T01:00:00.000Z');

    await createRunningSyncJob({
      db,
      leaseDurationMs: 60_000,
      now: claimTime,
      sourceId,
      workspaceIndexId,
    });

    await expect(
      createRunningSyncJob({
        db,
        now: new Date(claimTime.getTime() + 1_000),
        sourceId,
        workspaceIndexId,
      }),
    ).rejects.toBeInstanceOf(SyncJobAlreadyRunningError);
  });

  it('rejects a new running row without a lease', async () => {
    if (!db || !sourceId || !workspaceIndexId) {
      throw new Error('Sync lease test IDs were not initialized.');
    }

    await expect(
      db.insert(syncJobs).values({
        sourceId,
        startedAt: new Date(),
        status: 'running',
        workspaceIndexId,
      }),
    ).rejects.toThrow();
  });

  it('renews a heartbeat from the supplied clock', async () => {
    if (!db || !sourceId || !workspaceIndexId) {
      throw new Error('Sync lease test IDs were not initialized.');
    }

    const claimTime = new Date('2030-01-01T02:00:00.000Z');
    const syncJob = await createRunningSyncJob({
      db,
      leaseDurationMs: 1_000,
      now: claimTime,
      sourceId,
      workspaceIndexId,
    });
    const heartbeatTime = new Date(claimTime.getTime() + 500);
    const renewedSyncJob = await renewRunningSyncJobLease({
      db,
      leaseDurationMs: 2_000,
      now: heartbeatTime,
      syncJobId: syncJob.id,
    });

    expect(renewedSyncJob.leaseExpiresAt).toEqual(new Date(heartbeatTime.getTime() + 2_000));
  });

  it('prevents a worker with a lost lease from completing or overwriting its terminal job', async () => {
    if (!db || !sourceId || !workspaceIndexId) {
      throw new Error('Sync lease test IDs were not initialized.');
    }

    const claimTime = new Date('2030-01-01T03:00:00.000Z');
    const expiredSyncJob = await createRunningSyncJob({
      db,
      leaseDurationMs: 1_000,
      now: claimTime,
      sourceId,
      workspaceIndexId,
    });
    const replacementTime = new Date(claimTime.getTime() + 1_001);
    const replacementSyncJob = await createRunningSyncJob({
      db,
      now: replacementTime,
      sourceId,
      workspaceIndexId,
    });

    await expect(
      completeSyncJob({
        db,
        now: replacementTime,
        summary: emptySummary,
        syncJobId: expiredSyncJob.id,
      }),
    ).rejects.toBeInstanceOf(SyncJobLeaseLostError);

    const failedSyncJob = await failSyncJob({
      code: 'ingestion-failed',
      db,
      message: 'This must not replace the lease-expired state.',
      now: replacementTime,
      syncJobId: expiredSyncJob.id,
    });
    const [currentReplacement] = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.id, replacementSyncJob.id))
      .limit(1);

    expect(failedSyncJob).toMatchObject({
      errorCode: syncJobLeaseExpiredErrorCode,
      status: 'failed',
    });
    expect(currentReplacement).toMatchObject({
      id: replacementSyncJob.id,
      status: 'running',
    });
  });
});
