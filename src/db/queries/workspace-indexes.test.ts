import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { workspaceIndexes, workspaceSources, vaults, syncJobs } from '@/db/schema';
import {
  addGitHubSourceToWorkspaceIndex,
  createWorkspaceIndexWithGitHubSource,
  getVaultWorkspaceSourceUsage,
  getWorkspaceIndexById,
  getWorkspaceIndexDetail,
  getWorkspaceIndexLatestSourceSyncedAt,
  listWorkspaceIndexes,
  updatePrimarySourcePathFilters,
} from '@/db/queries/workspace-indexes';
import { githubSourceConfigSchema } from '@/lib/validators/source';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const openAiRepo = {
  owner: 'openai',
  repo: 'openai-cookbook',
  repoUrl: 'https://github.com/openai/openai-cookbook',
} as const;
const nextJsRepo = {
  owner: 'vercel',
  repo: 'next.js',
  repoUrl: 'https://github.com/vercel/next.js',
} as const;

describeWithDatabase('workspace index queries', () => {
  let db: Db | null = null;
  let workspaceIndexIds: string[] = [];
  let vaultIds: string[] = [];

  beforeEach(() => {
    db = getDb();
    workspaceIndexIds = [];
    vaultIds = [];
  });

  afterEach(async () => {
    if (db) {
      for (const workspaceIndexId of workspaceIndexIds) {
        await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
      }

      for (const vaultId of vaultIds) {
        await db.delete(vaults).where(eq(vaults.id, vaultId));
      }
    }

    db = null;
    workspaceIndexIds = [];
    vaultIds = [];
  });

  it('creates and updates GitHub source path filters', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary workspace index query test',
      excludePaths: ['archive'],
      includePaths: ['docs'],
      name: 'Workspace Index Query Test',
      parsedRepo: openAiRepo,
    });

    workspaceIndexIds.push(created.workspaceIndex.id);

    await expect(getWorkspaceIndexById(created.workspaceIndex.id)).resolves.toMatchObject({
      id: created.workspaceIndex.id,
      name: 'Workspace Index Query Test',
      vaultId: created.workspaceIndex.vaultId,
    });

    expect(created.source.config).toMatchObject({
      branch: 'main',
      excludePaths: ['archive'],
      includePaths: ['docs'],
      owner: 'openai',
      repo: 'openai-cookbook',
      repoUrl: 'https://github.com/openai/openai-cookbook',
    });

    const updatedSource = await updatePrimarySourcePathFilters(created.workspaceIndex.id, {
      excludePaths: [],
      includePaths: ['docs/api', 'README.md'],
    });

    expect(updatedSource?.config).toMatchObject({
      branch: 'main',
      includePaths: ['docs/api', 'README.md'],
      owner: 'openai',
      repo: 'openai-cookbook',
      repoUrl: 'https://github.com/openai/openai-cookbook',
    });
    expect(updatedSource?.config).not.toHaveProperty('excludePaths');
    const updatedSourceConfig = githubSourceConfigSchema.parse(updatedSource?.config);

    expect(updatedSourceConfig.excludePaths).toEqual([]);

    const detail = await getWorkspaceIndexDetail(created.workspaceIndex.id);
    const detailSourceConfig = githubSourceConfigSchema.parse(detail?.source?.config);

    expect(detailSourceConfig.includePaths).toEqual(['docs/api', 'README.md']);
    expect(detail?.source?.config).not.toHaveProperty('excludePaths');
    expect(detailSourceConfig.excludePaths).toEqual([]);
  });

  it('adds another source to an existing workspace index', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary multi-source query test',
      excludePaths: [],
      includePaths: ['docs'],
      name: 'Multi Source Query Test',
      parsedRepo: openAiRepo,
    });

    workspaceIndexIds.push(created.workspaceIndex.id);

    const addedSource = await addGitHubSourceToWorkspaceIndex({
      branch: 'main',
      excludePaths: ['archive'],
      includePaths: ['README.md'],
      parsedRepo: nextJsRepo,
      workspaceIndexId: created.workspaceIndex.id,
    });

    expect(addedSource).toMatchObject({
      name: 'vercel/next.js',
      type: 'github',
      workspaceIndexId: created.workspaceIndex.id,
    });

    if (!addedSource) {
      throw new Error('Expected added source.');
    }

    await db.insert(syncJobs).values([
      {
        completedAt: new Date('2026-06-20T10:01:00.000Z'),
        createdAt: new Date('2026-06-20T10:00:00.000Z'),
        documentsFound: 3,
        sourceId: created.source.id,
        startedAt: new Date('2026-06-20T10:00:00.000Z'),
        status: 'completed',
        workspaceIndexId: created.workspaceIndex.id,
      },
      {
        completedAt: new Date('2026-06-21T10:01:00.000Z'),
        createdAt: new Date('2026-06-21T10:00:00.000Z'),
        error: 'GitHub repository was not found.',
        errorCode: 'github-repo-not-found',
        sourceId: addedSource.id,
        startedAt: new Date('2026-06-21T10:00:00.000Z'),
        status: 'failed',
        workspaceIndexId: created.workspaceIndex.id,
      },
    ]);

    const detail = await getWorkspaceIndexDetail(created.workspaceIndex.id);
    const primarySource = detail?.sources.find((source) => source.id === created.source.id);
    const addedGitHubSource = detail?.sources.find((source) => source.id === addedSource.id);

    expect(detail?.sources.map((source) => source.id)).toEqual(
      expect.arrayContaining([created.source.id, addedSource?.id]),
    );
    expect(primarySource?.latestSyncJob?.status).toBe('completed');
    expect(primarySource?.latestSyncJob?.documentsFound).toBe(3);
    expect(addedGitHubSource?.latestSyncJob).toMatchObject({
      errorCode: 'github-repo-not-found',
      status: 'failed',
    });
  });

  it('lists source coverage counts for each workspace index', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary coverage query test',
      excludePaths: [],
      includePaths: [],
      name: 'Coverage Query Test',
      parsedRepo: openAiRepo,
    });

    workspaceIndexIds.push(created.workspaceIndex.id);

    await addGitHubSourceToWorkspaceIndex({
      branch: 'main',
      excludePaths: [],
      includePaths: ['README.md'],
      parsedRepo: nextJsRepo,
      workspaceIndexId: created.workspaceIndex.id,
    });
    await db
      .update(workspaceSources)
      .set({ lastSyncedAt: new Date('2026-06-22T10:00:00.000Z') })
      .where(eq(workspaceSources.id, created.source.id));

    await expect(
      getWorkspaceIndexLatestSourceSyncedAt({
        db,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toEqual(new Date('2026-06-22T10:00:00.000Z'));

    const workspaceIndexList = await listWorkspaceIndexes();
    const listedWorkspaceIndex = workspaceIndexList.find(
      (workspaceIndex) => workspaceIndex.id === created.workspaceIndex.id,
    );

    expect(listedWorkspaceIndex).toMatchObject({
      sourceCount: 2,
      syncedSourceCount: 1,
    });
  });

  it('lists workspace indexes by vault', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const [firstVault, secondVault] = await db
      .insert(vaults)
      .values([
        {
          description: 'First vault scope test.',
          name: 'First Vault Scope Test',
          slug: `first-vault-scope-test-${crypto.randomUUID()}`,
        },
        {
          description: 'Second vault scope test.',
          name: 'Second Vault Scope Test',
          slug: `second-vault-scope-test-${crypto.randomUUID()}`,
        },
      ])
      .returning();

    if (!firstVault || !secondVault) {
      throw new Error('Failed to create test vaults.');
    }

    vaultIds.push(firstVault.id, secondVault.id);

    const firstCreated = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'first vault workspace index',
      excludePaths: [],
      includePaths: [],
      name: 'First Vault KB',
      parsedRepo: openAiRepo,
      vaultId: firstVault.id,
    });
    const secondCreated = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'second vault workspace index',
      excludePaths: [],
      includePaths: [],
      name: 'Second Vault KB',
      parsedRepo: openAiRepo,
      vaultId: secondVault.id,
    });

    workspaceIndexIds.push(firstCreated.workspaceIndex.id, secondCreated.workspaceIndex.id);

    const firstVaultWorkspaceIndexes = await listWorkspaceIndexes({
      vaultId: firstVault.id,
    });
    const secondVaultWorkspaceIndexes = await listWorkspaceIndexes({
      vaultId: secondVault.id,
    });

    expect(firstVaultWorkspaceIndexes.map((workspaceIndex) => workspaceIndex.id)).toContain(
      firstCreated.workspaceIndex.id,
    );
    expect(firstVaultWorkspaceIndexes.map((workspaceIndex) => workspaceIndex.id)).not.toContain(
      secondCreated.workspaceIndex.id,
    );
    expect(secondVaultWorkspaceIndexes.map((workspaceIndex) => workspaceIndex.id)).toContain(
      secondCreated.workspaceIndex.id,
    );
    expect(secondVaultWorkspaceIndexes.map((workspaceIndex) => workspaceIndex.id)).not.toContain(
      firstCreated.workspaceIndex.id,
    );
  });

  it('counts workspace sources by vault', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const [firstVault, secondVault] = await db
      .insert(vaults)
      .values([
        {
          description: 'First source usage test.',
          name: 'First Source Usage Test',
          slug: `first-source-usage-test-${crypto.randomUUID()}`,
        },
        {
          description: 'Second source usage test.',
          name: 'Second Source Usage Test',
          slug: `second-source-usage-test-${crypto.randomUUID()}`,
        },
      ])
      .returning();

    if (!firstVault || !secondVault) {
      throw new Error('Failed to create test vaults.');
    }

    vaultIds.push(firstVault.id, secondVault.id);

    const firstCreated = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'first source usage workspace index',
      excludePaths: [],
      includePaths: [],
      name: 'First Source Usage KB',
      parsedRepo: openAiRepo,
      vaultId: firstVault.id,
    });
    const secondCreated = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'second source usage workspace index',
      excludePaths: [],
      includePaths: [],
      name: 'Second Source Usage KB',
      parsedRepo: openAiRepo,
      vaultId: secondVault.id,
    });

    workspaceIndexIds.push(firstCreated.workspaceIndex.id, secondCreated.workspaceIndex.id);

    await addGitHubSourceToWorkspaceIndex({
      branch: 'main',
      excludePaths: [],
      includePaths: [],
      parsedRepo: nextJsRepo,
      workspaceIndexId: firstCreated.workspaceIndex.id,
    });

    await expect(
      getVaultWorkspaceSourceUsage({
        db,
        vaultId: firstVault.id,
      }),
    ).resolves.toBe(2);
    await expect(
      getVaultWorkspaceSourceUsage({
        db,
        vaultId: secondVault.id,
      }),
    ).resolves.toBe(1);
  });
});
