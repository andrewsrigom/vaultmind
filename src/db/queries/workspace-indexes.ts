import { and, count, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { ensureDefaultVault } from '@/db/queries/vaults';
import {
  documentChunks,
  documents,
  workspaceIndexes,
  workspaceSources,
  syncableWorkspaceSourceTypes,
  syncJobs,
} from '@/db/schema';
import { githubSourceConfigSchema } from '@/lib/validators/source';

import type { Db } from '@/db';
import type {
  GoogleDriveSourceConfig,
  GitHubSourceConfig,
  NotionSourceConfig,
  WorkspaceIndex,
  WorkspaceSource,
  WorkspaceSourceType,
  SyncJob,
} from '@/db/schema';
import type { ParsedGitHubRepoUrl } from '@/lib/sources/github/parse-github-url';

export type CreateWorkspaceIndexWithGitHubSourceInput = {
  branch: string;
  description: string | null;
  excludePaths: string[];
  includePaths: string[];
  name: string;
  vaultId?: string | null;
  parsedRepo: ParsedGitHubRepoUrl;
};

export type AddGitHubSourceToWorkspaceIndexInput = {
  branch: string;
  excludePaths: string[];
  includePaths: string[];
  workspaceIndexId: string;
  parsedRepo: ParsedGitHubRepoUrl;
};

export type AddGoogleDriveSourceToWorkspaceIndexInput = {
  resources: GoogleDriveSourceConfig['resources'];
  workspaceIndexId: string;
};

export type AddNotionSourceToWorkspaceIndexInput = {
  resources: NotionSourceConfig['resources'];
  workspaceId?: string;
  workspaceIndexId: string;
  workspaceName?: string;
};

export type UpsertGoogleDriveSourceForWorkspaceIndexInput =
  AddGoogleDriveSourceToWorkspaceIndexInput;

export type UpsertNotionSourceForWorkspaceIndexInput = AddNotionSourceToWorkspaceIndexInput;

export type WorkspaceIndexDetail = {
  chunkCount: number;
  documentCount: number;
  workspaceIndex: WorkspaceIndex;
  latestSyncJob: SyncJob | null;
  source: WorkspaceSource | null;
  sources: WorkspaceSourceWithLatestSync[];
};

export type WorkspaceSourceWithLatestSync = WorkspaceSource & {
  latestSyncJob: SyncJob | null;
};

export type DashboardSummary = {
  latestSyncedWorkspaceIndex: {
    id: string;
    lastSyncedAt: Date;
    name: string;
  } | null;
  totalChunks: number;
  totalDocuments: number;
  totalWorkspaceIndexes: number;
};

export type WorkspaceIndexListItem = {
  chunkCount: number;
  createdAt: Date;
  description: string | null;
  documentCount: number;
  id: string;
  lastSyncedAt: Date | null;
  name: string;
  vaultId: string;
  sourceCount: number;
  sourceCountsByType: Partial<Record<WorkspaceSourceType, number>>;
  syncedSourceCount: number;
  updatedAt: Date;
};

export type WorkspaceIndexWithSource = {
  workspaceIndex: WorkspaceIndex;
  source: WorkspaceSource;
};

export type UpdateWorkspaceIndexMetadataInput = {
  description: string | null;
  name: string;
};

export type UpdateSourcePathFiltersInput = {
  excludePaths: string[];
  includePaths: string[];
};

export type ListWorkspaceIndexesInput = {
  vaultId?: string | null;
};

export type GetVaultWorkspaceSourceUsageInput = {
  db?: Db;
  vaultId: string;
};

function requireCreatedRow<TValue>(row: TValue | undefined, message: string): TValue {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function workspaceIndexExists(workspaceIndexId: string): Promise<boolean> {
  const db = getDb();
  const [workspaceIndex] = await db
    .select({ id: workspaceIndexes.id })
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, workspaceIndexId))
    .limit(1);

  return Boolean(workspaceIndex);
}

export async function addGitHubSourceToWorkspaceIndex(
  input: AddGitHubSourceToWorkspaceIndexInput,
): Promise<WorkspaceSource | null> {
  if (!(await workspaceIndexExists(input.workspaceIndexId))) {
    return null;
  }

  const db = getDb();
  const config: GitHubSourceConfig = {
    branch: input.branch,
    ...(input.excludePaths.length > 0 ? { excludePaths: input.excludePaths } : {}),
    ...(input.includePaths.length > 0 ? { includePaths: input.includePaths } : {}),
    owner: input.parsedRepo.owner,
    repo: input.parsedRepo.repo,
    repoUrl: input.parsedRepo.repoUrl,
  };
  const [source] = await db
    .insert(workspaceSources)
    .values({
      config,
      name: `${config.owner}/${config.repo}`,
      type: 'github',
      workspaceIndexId: input.workspaceIndexId,
    })
    .returning();

  return source ?? null;
}

export async function addNotionSourceToWorkspaceIndex(
  input: AddNotionSourceToWorkspaceIndexInput,
): Promise<WorkspaceSource | null> {
  if (!(await workspaceIndexExists(input.workspaceIndexId))) {
    return null;
  }

  const db = getDb();
  const config: NotionSourceConfig = {
    resources: input.resources,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.workspaceName ? { workspaceName: input.workspaceName } : {}),
  };
  const [source] = await db
    .insert(workspaceSources)
    .values({
      config,
      name: input.workspaceName ? `Notion: ${input.workspaceName}` : 'Notion',
      type: 'notion',
      workspaceIndexId: input.workspaceIndexId,
    })
    .returning();

  return source ?? null;
}

export async function addGoogleDriveSourceToWorkspaceIndex(
  input: AddGoogleDriveSourceToWorkspaceIndexInput,
): Promise<WorkspaceSource | null> {
  if (!(await workspaceIndexExists(input.workspaceIndexId))) {
    return null;
  }

  const db = getDb();
  const config: GoogleDriveSourceConfig = {
    resources: input.resources,
  };
  const [source] = await db
    .insert(workspaceSources)
    .values({
      config,
      name: 'Google Drive',
      type: 'google-drive',
      workspaceIndexId: input.workspaceIndexId,
    })
    .returning();

  return source ?? null;
}

export async function upsertGoogleDriveSourceForWorkspaceIndex(
  input: UpsertGoogleDriveSourceForWorkspaceIndexInput,
): Promise<WorkspaceSource | null> {
  if (!(await workspaceIndexExists(input.workspaceIndexId))) {
    return null;
  }

  const db = getDb();
  const config: GoogleDriveSourceConfig = {
    resources: input.resources,
  };
  const [existingSource] = await db
    .select()
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.workspaceIndexId, input.workspaceIndexId),
        eq(workspaceSources.type, 'google-drive'),
      ),
    )
    .orderBy(desc(workspaceSources.createdAt))
    .limit(1);

  if (!existingSource) {
    return addGoogleDriveSourceToWorkspaceIndex(input);
  }

  const [source] = await db
    .update(workspaceSources)
    .set({
      config,
      name: 'Google Drive',
      updatedAt: new Date(),
    })
    .where(eq(workspaceSources.id, existingSource.id))
    .returning();

  return source ?? null;
}

export async function upsertNotionSourceForWorkspaceIndex(
  input: UpsertNotionSourceForWorkspaceIndexInput,
): Promise<WorkspaceSource | null> {
  if (!(await workspaceIndexExists(input.workspaceIndexId))) {
    return null;
  }

  const db = getDb();
  const config: NotionSourceConfig = {
    resources: input.resources,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.workspaceName ? { workspaceName: input.workspaceName } : {}),
  };
  const name = input.workspaceName ? `Notion: ${input.workspaceName}` : 'Notion';
  const [existingSource] = await db
    .select()
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.workspaceIndexId, input.workspaceIndexId),
        eq(workspaceSources.type, 'notion'),
      ),
    )
    .orderBy(desc(workspaceSources.createdAt))
    .limit(1);

  if (!existingSource) {
    return addNotionSourceToWorkspaceIndex(input);
  }

  const [source] = await db
    .update(workspaceSources)
    .set({
      config,
      name,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSources.id, existingSource.id))
    .returning();

  return source ?? null;
}

export async function createWorkspaceIndexWithGitHubSource(
  input: CreateWorkspaceIndexWithGitHubSourceInput,
): Promise<WorkspaceIndexWithSource> {
  const db = getDb();

  if (!input.vaultId) {
    await ensureDefaultVault(db);
  }

  return db.transaction(async (tx) => {
    const [createdWorkspaceIndex] = await tx
      .insert(workspaceIndexes)
      .values({
        description: input.description,
        name: input.name,
        ...(input.vaultId ? { vaultId: input.vaultId } : {}),
      })
      .returning();

    const workspaceIndex = requireCreatedRow(
      createdWorkspaceIndex,
      'Failed to create workspace index.',
    );

    const config: GitHubSourceConfig = {
      branch: input.branch,
      ...(input.excludePaths.length > 0 ? { excludePaths: input.excludePaths } : {}),
      ...(input.includePaths.length > 0 ? { includePaths: input.includePaths } : {}),
      owner: input.parsedRepo.owner,
      repo: input.parsedRepo.repo,
      repoUrl: input.parsedRepo.repoUrl,
    };

    const [createdSource] = await tx
      .insert(workspaceSources)
      .values({
        config,
        name: `${config.owner}/${config.repo}`,
        type: 'github',
        workspaceIndexId: workspaceIndex.id,
      })
      .returning();

    const source = requireCreatedRow(createdSource, 'Failed to create source.');

    return {
      source,
      workspaceIndex,
    };
  });
}

export async function getVaultWorkspaceSourceUsage({
  db = getDb(),
  vaultId,
}: GetVaultWorkspaceSourceUsageInput): Promise<number> {
  const [row] = await db
    .select({
      value: count(workspaceSources.id),
    })
    .from(workspaceSources)
    .innerJoin(workspaceIndexes, eq(workspaceIndexes.id, workspaceSources.workspaceIndexId))
    .where(eq(workspaceIndexes.vaultId, vaultId));

  return row?.value ?? 0;
}

function withPathFilters<TConfig extends GitHubSourceConfig>(
  config: TConfig,
  input: UpdateSourcePathFiltersInput,
): TConfig {
  const configWithoutPathFilters = { ...config };

  delete configWithoutPathFilters.excludePaths;
  delete configWithoutPathFilters.includePaths;

  return {
    ...configWithoutPathFilters,
    ...(input.excludePaths.length > 0 ? { excludePaths: input.excludePaths } : {}),
    ...(input.includePaths.length > 0 ? { includePaths: input.includePaths } : {}),
  };
}

export async function updatePrimarySourcePathFilters(
  workspaceIndexId: string,
  input: UpdateSourcePathFiltersInput,
): Promise<WorkspaceSource | null> {
  const db = getDb();
  const [source] = await db
    .select()
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.workspaceIndexId, workspaceIndexId),
        inArray(workspaceSources.type, syncableWorkspaceSourceTypes),
      ),
    )
    .orderBy(desc(workspaceSources.createdAt))
    .limit(1);

  if (!source) {
    return null;
  }

  const parsedConfig = githubSourceConfigSchema.safeParse(source.config);

  if (!parsedConfig.success) {
    return null;
  }

  const config = withPathFilters(parsedConfig.data, input);
  const [updatedSource] = await db
    .update(workspaceSources)
    .set({
      config,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSources.id, source.id))
    .returning();

  return updatedSource ?? null;
}

export async function updateSourcePathFilters(
  workspaceIndexId: string,
  sourceId: string,
  input: UpdateSourcePathFiltersInput,
): Promise<WorkspaceSource | null> {
  const db = getDb();
  const [source] = await db
    .select()
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.id, sourceId),
        eq(workspaceSources.workspaceIndexId, workspaceIndexId),
        inArray(workspaceSources.type, syncableWorkspaceSourceTypes),
      ),
    )
    .limit(1);

  if (!source) {
    return null;
  }

  const parsedConfig = githubSourceConfigSchema.safeParse(source.config);

  if (!parsedConfig.success) {
    return null;
  }

  const config = withPathFilters(parsedConfig.data, input);
  const [updatedSource] = await db
    .update(workspaceSources)
    .set({
      config,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSources.id, source.id))
    .returning();

  return updatedSource ?? null;
}

export async function deleteWorkspaceIndex(workspaceIndexId: string): Promise<boolean> {
  const db = getDb();
  const deletedRows = await db
    .delete(workspaceIndexes)
    .where(eq(workspaceIndexes.id, workspaceIndexId))
    .returning({ id: workspaceIndexes.id });

  return deletedRows.length > 0;
}

export async function deleteWorkspaceSource(input: {
  sourceId: string;
  workspaceIndexId: string;
}): Promise<WorkspaceSource | null> {
  const db = getDb();
  const [source] = await db
    .delete(workspaceSources)
    .where(
      and(
        eq(workspaceSources.id, input.sourceId),
        eq(workspaceSources.workspaceIndexId, input.workspaceIndexId),
      ),
    )
    .returning();

  return source ?? null;
}

export async function getDashboardSummary(
  input: ListWorkspaceIndexesInput = {},
): Promise<DashboardSummary> {
  const db = getDb();
  const workspaceIndexRows = input.vaultId
    ? await db
        .select({ id: workspaceIndexes.id })
        .from(workspaceIndexes)
        .where(eq(workspaceIndexes.vaultId, input.vaultId))
    : await db.select({ id: workspaceIndexes.id }).from(workspaceIndexes);
  const workspaceIndexIds = workspaceIndexRows.map((row) => row.id);

  if (input.vaultId && workspaceIndexIds.length === 0) {
    return {
      latestSyncedWorkspaceIndex: null,
      totalChunks: 0,
      totalDocuments: 0,
      totalWorkspaceIndexes: 0,
    };
  }

  const [workspaceIndexCountRow] = input.vaultId
    ? await db
        .select({ value: count(workspaceIndexes.id) })
        .from(workspaceIndexes)
        .where(eq(workspaceIndexes.vaultId, input.vaultId))
    : await db.select({ value: count(workspaceIndexes.id) }).from(workspaceIndexes);
  const [documentCountRow] = workspaceIndexIds.length
    ? await db
        .select({ value: count(documents.id) })
        .from(documents)
        .where(inArray(documents.workspaceIndexId, workspaceIndexIds))
    : [{ value: 0 }];
  const [chunkCountRow] = workspaceIndexIds.length
    ? await db
        .select({ value: count(documentChunks.id) })
        .from(documentChunks)
        .where(inArray(documentChunks.workspaceIndexId, workspaceIndexIds))
    : [{ value: 0 }];
  const [latestSyncedSource] = await db
    .select({
      lastSyncedAt: workspaceSources.lastSyncedAt,
      workspaceIndexId: workspaceSources.workspaceIndexId,
    })
    .from(workspaceSources)
    .where(
      and(
        isNotNull(workspaceSources.lastSyncedAt),
        inArray(workspaceSources.type, syncableWorkspaceSourceTypes),
        ...(workspaceIndexIds.length
          ? [inArray(workspaceSources.workspaceIndexId, workspaceIndexIds)]
          : []),
      ),
    )
    .orderBy(desc(workspaceSources.lastSyncedAt))
    .limit(1);

  if (!latestSyncedSource?.lastSyncedAt) {
    return {
      latestSyncedWorkspaceIndex: null,
      totalChunks: chunkCountRow?.value ?? 0,
      totalDocuments: documentCountRow?.value ?? 0,
      totalWorkspaceIndexes: workspaceIndexCountRow?.value ?? 0,
    };
  }

  const [workspaceIndex] = await db
    .select()
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, latestSyncedSource.workspaceIndexId))
    .limit(1);

  return {
    latestSyncedWorkspaceIndex: workspaceIndex
      ? {
          id: workspaceIndex.id,
          lastSyncedAt: latestSyncedSource.lastSyncedAt,
          name: workspaceIndex.name,
        }
      : null,
    totalChunks: chunkCountRow?.value ?? 0,
    totalDocuments: documentCountRow?.value ?? 0,
    totalWorkspaceIndexes: workspaceIndexCountRow?.value ?? 0,
  };
}

export async function getWorkspaceIndexById(
  workspaceIndexId: string,
): Promise<WorkspaceIndex | null> {
  const db = getDb();
  const [workspaceIndex] = await db
    .select()
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, workspaceIndexId))
    .limit(1);

  return workspaceIndex ?? null;
}

export async function getWorkspaceIndexLatestSourceSyncedAt({
  db = getDb(),
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
}): Promise<Date | null> {
  const [latestSyncedSource] = await db
    .select({
      lastSyncedAt: workspaceSources.lastSyncedAt,
    })
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.workspaceIndexId, workspaceIndexId),
        isNotNull(workspaceSources.lastSyncedAt),
        inArray(workspaceSources.type, syncableWorkspaceSourceTypes),
      ),
    )
    .orderBy(desc(workspaceSources.lastSyncedAt))
    .limit(1);

  return latestSyncedSource?.lastSyncedAt ?? null;
}

export async function getWorkspaceIndexDetail(
  workspaceIndexId: string,
): Promise<WorkspaceIndexDetail | null> {
  const db = getDb();
  const workspaceIndex = await getWorkspaceIndexById(workspaceIndexId);

  if (!workspaceIndex) {
    return null;
  }

  const [source] = await db
    .select()
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.workspaceIndexId, workspaceIndexId),
        inArray(workspaceSources.type, syncableWorkspaceSourceTypes),
      ),
    )
    .orderBy(desc(workspaceSources.createdAt))
    .limit(1);
  const sources = await db
    .select()
    .from(workspaceSources)
    .where(eq(workspaceSources.workspaceIndexId, workspaceIndexId))
    .orderBy(desc(workspaceSources.createdAt));
  const sourceIds = sources.map((workspaceSource) => workspaceSource.id);
  const syncJobsBySourceId = new Map<string, SyncJob>();

  if (sourceIds.length > 0) {
    const sourceSyncJobs = await db
      .select()
      .from(syncJobs)
      .where(inArray(syncJobs.sourceId, sourceIds))
      .orderBy(desc(syncJobs.createdAt));

    for (const syncJob of sourceSyncJobs) {
      if (!syncJobsBySourceId.has(syncJob.sourceId)) {
        syncJobsBySourceId.set(syncJob.sourceId, syncJob);
      }
    }
  }

  const [documentCountRow] = await db
    .select({ value: count(documents.id) })
    .from(documents)
    .where(eq(documents.workspaceIndexId, workspaceIndexId));

  const [chunkCountRow] = await db
    .select({ value: count(documentChunks.id) })
    .from(documentChunks)
    .where(eq(documentChunks.workspaceIndexId, workspaceIndexId));

  const [latestSyncJob] = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.workspaceIndexId, workspaceIndexId))
    .orderBy(desc(syncJobs.createdAt))
    .limit(1);

  return {
    chunkCount: chunkCountRow?.value ?? 0,
    documentCount: documentCountRow?.value ?? 0,
    latestSyncJob: latestSyncJob ?? null,
    source: source ?? null,
    sources: sources.map((workspaceSource) => ({
      ...workspaceSource,
      latestSyncJob: syncJobsBySourceId.get(workspaceSource.id) ?? null,
    })),
    workspaceIndex,
  };
}

export async function listWorkspaceIndexes(
  input: ListWorkspaceIndexesInput = {},
): Promise<WorkspaceIndexListItem[]> {
  const db = getDb();
  const workspaceIndexRows = input.vaultId
    ? await db
        .select()
        .from(workspaceIndexes)
        .where(eq(workspaceIndexes.vaultId, input.vaultId))
        .orderBy(desc(workspaceIndexes.createdAt))
    : await db.select().from(workspaceIndexes).orderBy(desc(workspaceIndexes.createdAt));

  if (workspaceIndexRows.length === 0) {
    return [];
  }

  const chunkCountRows = await db
    .select({
      value: count(documentChunks.id),
      workspaceIndexId: documentChunks.workspaceIndexId,
    })
    .from(documentChunks)
    .groupBy(documentChunks.workspaceIndexId);

  const documentCountRows = await db
    .select({
      value: count(documents.id),
      workspaceIndexId: documents.workspaceIndexId,
    })
    .from(documents)
    .groupBy(documents.workspaceIndexId);

  const sourceRows = await db
    .select({
      lastSyncedAt: workspaceSources.lastSyncedAt,
      type: workspaceSources.type,
      workspaceIndexId: workspaceSources.workspaceIndexId,
    })
    .from(workspaceSources);

  const chunkCountByWorkspaceIndexId = new Map(
    chunkCountRows.map((row) => [row.workspaceIndexId, row.value]),
  );
  const documentCountByWorkspaceIndexId = new Map(
    documentCountRows.map((row) => [row.workspaceIndexId, row.value]),
  );
  const lastSyncedAtByWorkspaceIndexId = new Map<string, Date>();
  const sourceCountByWorkspaceIndexId = new Map<string, number>();
  const sourceCountsByWorkspaceIndexId = new Map<
    string,
    Partial<Record<WorkspaceSourceType, number>>
  >();
  const syncedSourceCountByWorkspaceIndexId = new Map<string, number>();

  for (const row of sourceRows) {
    sourceCountByWorkspaceIndexId.set(
      row.workspaceIndexId,
      (sourceCountByWorkspaceIndexId.get(row.workspaceIndexId) ?? 0) + 1,
    );
    const sourceCounts = sourceCountsByWorkspaceIndexId.get(row.workspaceIndexId) ?? {};

    sourceCounts[row.type] = (sourceCounts[row.type] ?? 0) + 1;
    sourceCountsByWorkspaceIndexId.set(row.workspaceIndexId, sourceCounts);

    if (!row.lastSyncedAt) {
      continue;
    }

    syncedSourceCountByWorkspaceIndexId.set(
      row.workspaceIndexId,
      (syncedSourceCountByWorkspaceIndexId.get(row.workspaceIndexId) ?? 0) + 1,
    );

    const currentLastSyncedAt = lastSyncedAtByWorkspaceIndexId.get(row.workspaceIndexId);

    if (!currentLastSyncedAt || row.lastSyncedAt > currentLastSyncedAt) {
      lastSyncedAtByWorkspaceIndexId.set(row.workspaceIndexId, row.lastSyncedAt);
    }
  }

  return workspaceIndexRows.map((workspaceIndex) => ({
    chunkCount: chunkCountByWorkspaceIndexId.get(workspaceIndex.id) ?? 0,
    createdAt: workspaceIndex.createdAt,
    description: workspaceIndex.description,
    documentCount: documentCountByWorkspaceIndexId.get(workspaceIndex.id) ?? 0,
    id: workspaceIndex.id,
    lastSyncedAt: lastSyncedAtByWorkspaceIndexId.get(workspaceIndex.id) ?? null,
    name: workspaceIndex.name,
    sourceCount: sourceCountByWorkspaceIndexId.get(workspaceIndex.id) ?? 0,
    sourceCountsByType: sourceCountsByWorkspaceIndexId.get(workspaceIndex.id) ?? {},
    syncedSourceCount: syncedSourceCountByWorkspaceIndexId.get(workspaceIndex.id) ?? 0,
    updatedAt: workspaceIndex.updatedAt,
    vaultId: workspaceIndex.vaultId,
  }));
}

export async function updateWorkspaceIndexMetadata(
  workspaceIndexId: string,
  input: UpdateWorkspaceIndexMetadataInput,
): Promise<WorkspaceIndex | null> {
  const db = getDb();
  const [updatedWorkspaceIndex] = await db
    .update(workspaceIndexes)
    .set({
      description: input.description,
      name: input.name,
      updatedAt: new Date(),
    })
    .where(eq(workspaceIndexes.id, workspaceIndexId))
    .returning();

  return updatedWorkspaceIndex ?? null;
}
