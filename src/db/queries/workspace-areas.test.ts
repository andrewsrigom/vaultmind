import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import {
  getWorkspaceAreaByIdOrSlug,
  listWorkspaceAreas,
  createWorkspaceArea,
  updateWorkspaceArea,
  upsertWorkspaceArea,
} from '@/db/queries/workspace-areas';
import { createWorkspaceIndexWithGitHubSource } from '@/db/queries/workspace-indexes';
import { workspaceAreas, workspaceIndexes } from '@/db/schema';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const parsedRepo = {
  owner: 'openai',
  repo: 'openai-cookbook',
  repoUrl: 'https://github.com/openai/openai-cookbook',
} as const;

describeWithDatabase('workspace area queries', () => {
  let db: Db | null = null;
  let workspaceAreaIds: string[] = [];
  let workspaceIndexIds: string[] = [];

  beforeEach(() => {
    db = getDb();
    workspaceAreaIds = [];
    workspaceIndexIds = [];
  });

  afterEach(async () => {
    if (db) {
      for (const workspaceAreaId of workspaceAreaIds) {
        await db.delete(workspaceAreas).where(eq(workspaceAreas.id, workspaceAreaId));
      }

      for (const workspaceIndexId of workspaceIndexIds) {
        await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
      }
    }

    db = null;
    workspaceAreaIds = [];
    workspaceIndexIds = [];
  });

  it('updates editable area metadata and includes the icon in list results', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary workspace area test',
      excludePaths: [],
      includePaths: [],
      name: 'Workspace Area Query Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);

    const area = await createWorkspaceArea({
      db,
      description: null,
      icon: 'folder',
      name: `Workspace Area ${crypto.randomUUID()}`,
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(area.id);

    const duplicateNamedArea = await createWorkspaceArea({
      db,
      description: null,
      icon: 'folder',
      name: area.name,
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(duplicateNamedArea.id);

    expect(duplicateNamedArea.id).not.toBe(area.id);
    expect(duplicateNamedArea.slug).not.toBe(area.slug);

    const updatedArea = await updateWorkspaceArea({
      db,
      description: 'Owns security playbooks and access reviews.',
      icon: 'shield',
      name: 'Security Operations',
      vaultId: created.workspaceIndex.vaultId,
      workspaceAreaId: area.id,
    });

    expect(updatedArea).toMatchObject({
      description: 'Owns security playbooks and access reviews.',
      icon: 'shield',
      id: area.id,
      name: 'Security Operations',
    });

    const rediscoveredArea = await upsertWorkspaceArea({
      db,
      description: 'Updated source-backed area description.',
      name: 'Security Operations',
      origin: 'ai-discovered',
      slug: area.slug,
      vaultId: created.workspaceIndex.vaultId,
    });

    expect(rediscoveredArea).toMatchObject({
      description: 'Updated source-backed area description.',
      icon: 'shield',
      id: area.id,
      name: 'Security Operations',
    });

    const areaResolvedBySlug = await getWorkspaceAreaByIdOrSlug({
      db,
      vaultId: created.workspaceIndex.vaultId,
      workspaceAreaIdentifier: area.slug,
    });

    expect(areaResolvedBySlug?.id).toBe(area.id);

    const listedAreas = await listWorkspaceAreas({
      db,
      vaultId: created.workspaceIndex.vaultId,
    });

    expect(listedAreas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Updated source-backed area description.',
          icon: 'shield',
          id: area.id,
          name: 'Security Operations',
        }),
      ]),
    );
  });
});
