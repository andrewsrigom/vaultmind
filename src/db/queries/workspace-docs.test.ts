import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  archiveWorkspaceDoc,
  createWorkspaceDoc,
  getWorkspaceDoc,
  listArchivedWorkspaceDocs,
  listWorkspaceDocs,
  moveWorkspaceDoc,
  publishWorkspaceDoc,
  restoreWorkspaceDoc,
  setWorkspaceDocFavorite,
  unpublishWorkspaceDoc,
  updateWorkspaceDoc,
} from '@/db/queries/workspace-docs';
import { ensureDefaultVault } from '@/db/queries/vaults';
import { createWorkspaceArea } from '@/db/queries/workspace-areas';
import { workspaceAreas } from '@/db/schema';

import type { Db } from '@/db';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('workspace doc queries', () => {
  let db: Db | null = null;
  let workspaceAreaIds: string[] = [];

  beforeEach(() => {
    db = getDb();
    workspaceAreaIds = [];
  });

  afterEach(async () => {
    if (db) {
      for (const workspaceAreaId of workspaceAreaIds) {
        await db.delete(workspaceAreas).where(eq(workspaceAreas.id, workspaceAreaId));
      }
    }

    db = null;
    workspaceAreaIds = [];
  });

  it('creates root docs and nested docs without a depth-specific path model', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const vault = await ensureDefaultVault(db);
    const area = await createWorkspaceArea({
      db,
      description: null,
      icon: 'folder',
      name: `Docs Space ${crypto.randomUUID()}`,
      vaultId: vault.id,
    });
    workspaceAreaIds.push(area.id);

    const rootDoc = await createWorkspaceDoc({
      db,
      title: 'Company Handbook',
      vaultId: vault.id,
      workspaceAreaId: area.id,
    });

    expect(rootDoc).toMatchObject({
      docType: 'note',
      isFavorite: false,
      parentDocId: null,
      status: 'draft',
      tags: [],
      title: 'Company Handbook',
      workspaceAreaId: area.id,
    });

    if (!rootDoc) {
      throw new Error('Expected root doc to be created.');
    }

    const childDoc = await createWorkspaceDoc({
      db,
      docType: 'note',
      parentDocId: rootDoc.id,
      status: 'published',
      tags: ['doc'],
      title: 'Policies and Procedures',
      vaultId: vault.id,
      workspaceAreaId: area.id,
    });

    expect(childDoc).toMatchObject({
      docType: 'note',
      parentDocId: rootDoc.id,
      publishedContent: '',
      publishedTitle: 'Policies and Procedures',
      status: 'published',
      tags: ['doc'],
      title: 'Policies and Procedures',
      workspaceAreaId: area.id,
    });
    expect(childDoc?.publishedAt).toBeInstanceOf(Date);

    if (!childDoc) {
      throw new Error('Expected child doc to be created.');
    }

    const duplicateRootTitle = await createWorkspaceDoc({
      db,
      title: rootDoc.title,
      vaultId: vault.id,
      workspaceAreaId: area.id,
    });

    expect(duplicateRootTitle?.id).not.toBe(rootDoc.id);
    expect(duplicateRootTitle?.slug).not.toBe(rootDoc.slug);

    const listedDocs = await listWorkspaceDocs({
      db,
      vaultId: vault.id,
    });

    expect(listedDocs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rootDoc.id,
          parentDocId: null,
          title: 'Company Handbook',
        }),
        expect.objectContaining({
          id: childDoc.id,
          parentDocId: rootDoc.id,
          title: 'Policies and Procedures',
        }),
      ]),
    );

    const detailedDoc = await getWorkspaceDoc({
      db,
      docId: rootDoc.id,
      vaultId: vault.id,
    });

    expect(detailedDoc).toMatchObject({
      areaName: area.name,
      areaSlug: area.slug,
      id: rootDoc.id,
    });
  });

  it('keeps published snapshots separate from editable drafts', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const vault = await ensureDefaultVault(db);
    const area = await createWorkspaceArea({
      db,
      description: null,
      icon: 'folder',
      name: `Published Docs Space ${crypto.randomUUID()}`,
      vaultId: vault.id,
    });
    workspaceAreaIds.push(area.id);

    const createdDoc = await createWorkspaceDoc({
      content: 'Initial handbook content',
      db,
      title: 'Handbook',
      vaultId: vault.id,
      workspaceAreaId: area.id,
    });

    if (!createdDoc) {
      throw new Error('Expected doc to be created.');
    }

    const publishedDoc = await publishWorkspaceDoc({
      db,
      docId: createdDoc.id,
      vaultId: vault.id,
    });

    expect(publishedDoc).toMatchObject({
      content: 'Initial handbook content',
      publishedContent: 'Initial handbook content',
      publishedTitle: 'Handbook',
      status: 'published',
    });
    expect(publishedDoc?.publishedAt).toBeInstanceOf(Date);

    const updatedDraft = await updateWorkspaceDoc({
      content: 'Autosaved draft with unpublished edits',
      db,
      docId: createdDoc.id,
      title: 'Handbook v2',
      vaultId: vault.id,
    });

    expect(updatedDraft).toMatchObject({
      content: 'Autosaved draft with unpublished edits',
      publishedContent: 'Initial handbook content',
      publishedTitle: 'Handbook',
      status: 'published',
      title: 'Handbook v2',
    });

    const detailedDoc = await getWorkspaceDoc({
      db,
      docId: createdDoc.id,
      vaultId: vault.id,
    });

    expect(detailedDoc).toMatchObject({
      content: 'Autosaved draft with unpublished edits',
      publishedContent: 'Initial handbook content',
      publishedTitle: 'Handbook',
      status: 'published',
      title: 'Handbook v2',
    });

    const unpublishedDoc = await unpublishWorkspaceDoc({
      db,
      docId: createdDoc.id,
      vaultId: vault.id,
    });

    expect(unpublishedDoc).toMatchObject({
      content: 'Autosaved draft with unpublished edits',
      publishedAt: null,
      publishedContent: null,
      publishedTitle: null,
      status: 'draft',
      title: 'Handbook v2',
    });
  });

  it('toggles favorite state without changing doc content', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const vault = await ensureDefaultVault(db);
    const area = await createWorkspaceArea({
      db,
      description: null,
      icon: 'folder',
      name: `Favorite Docs Space ${crypto.randomUUID()}`,
      vaultId: vault.id,
    });
    workspaceAreaIds.push(area.id);

    const createdDoc = await createWorkspaceDoc({
      content: 'Keep this content unchanged',
      db,
      title: 'Favorite Handbook',
      vaultId: vault.id,
      workspaceAreaId: area.id,
    });

    if (!createdDoc) {
      throw new Error('Expected doc to be created.');
    }

    const favoritedDoc = await setWorkspaceDocFavorite({
      db,
      docId: createdDoc.id,
      isFavorite: true,
      vaultId: vault.id,
    });

    expect(favoritedDoc).toMatchObject({
      content: 'Keep this content unchanged',
      isFavorite: true,
      title: 'Favorite Handbook',
    });

    const listedDocs = await listWorkspaceDocs({
      db,
      vaultId: vault.id,
    });

    expect(listedDocs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdDoc.id,
          isFavorite: true,
        }),
      ]),
    );

    const unfavoritedDoc = await setWorkspaceDocFavorite({
      db,
      docId: createdDoc.id,
      isFavorite: false,
      vaultId: vault.id,
    });

    expect(unfavoritedDoc).toMatchObject({
      content: 'Keep this content unchanged',
      isFavorite: false,
      title: 'Favorite Handbook',
    });
  });

  it('moves docs with descendants and archives then restores a doc subtree', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const vault = await ensureDefaultVault(db);
    const firstArea = await createWorkspaceArea({
      db,
      description: null,
      icon: 'folder',
      name: `Move Source Space ${crypto.randomUUID()}`,
      vaultId: vault.id,
    });
    const secondArea = await createWorkspaceArea({
      db,
      description: null,
      icon: 'folder',
      name: `Move Target Space ${crypto.randomUUID()}`,
      vaultId: vault.id,
    });
    workspaceAreaIds.push(firstArea.id, secondArea.id);

    const rootDoc = await createWorkspaceDoc({
      db,
      title: 'Move Me',
      vaultId: vault.id,
      workspaceAreaId: firstArea.id,
    });

    if (!rootDoc) {
      throw new Error('Expected root doc to be created.');
    }

    const childDoc = await createWorkspaceDoc({
      db,
      parentDocId: rootDoc.id,
      title: 'Child Moves Too',
      vaultId: vault.id,
      workspaceAreaId: firstArea.id,
    });

    if (!childDoc) {
      throw new Error('Expected child doc to be created.');
    }

    const invalidMove = await moveWorkspaceDoc({
      db,
      docId: rootDoc.id,
      parentDocId: childDoc.id,
      vaultId: vault.id,
      workspaceAreaId: firstArea.id,
    });

    expect(invalidMove).toBeNull();

    const movedDoc = await moveWorkspaceDoc({
      db,
      docId: rootDoc.id,
      parentDocId: null,
      vaultId: vault.id,
      workspaceAreaId: secondArea.id,
    });

    expect(movedDoc).toMatchObject({
      id: rootDoc.id,
      parentDocId: null,
      workspaceAreaId: secondArea.id,
    });

    const movedChildDoc = await getWorkspaceDoc({
      db,
      docId: childDoc.id,
      vaultId: vault.id,
    });

    expect(movedChildDoc).toMatchObject({
      id: childDoc.id,
      parentDocId: rootDoc.id,
      workspaceAreaId: secondArea.id,
    });

    const archivedDoc = await archiveWorkspaceDoc({
      db,
      docId: rootDoc.id,
      vaultId: vault.id,
    });

    expect(archivedDoc?.archivedAt).toBeInstanceOf(Date);

    const activeDocsAfterArchive = await listWorkspaceDocs({
      db,
      vaultId: vault.id,
    });

    expect(activeDocsAfterArchive).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rootDoc.id,
        }),
        expect.objectContaining({
          id: childDoc.id,
        }),
      ]),
    );

    const archivedDocs = await listArchivedWorkspaceDocs({
      db,
      vaultId: vault.id,
    });

    expect(archivedDocs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rootDoc.id,
        }),
        expect.objectContaining({
          id: childDoc.id,
        }),
      ]),
    );

    const activeOnlyArchivedDoc = await getWorkspaceDoc({
      db,
      docId: rootDoc.id,
      vaultId: vault.id,
    });

    expect(activeOnlyArchivedDoc).toBeNull();

    const archivedDetailDoc = await getWorkspaceDoc({
      db,
      docId: rootDoc.id,
      includeArchived: true,
      vaultId: vault.id,
    });

    expect(archivedDetailDoc).toMatchObject({
      id: rootDoc.id,
      workspaceAreaId: secondArea.id,
    });
    expect(archivedDetailDoc?.archivedAt).toBeInstanceOf(Date);

    const restoredDoc = await restoreWorkspaceDoc({
      db,
      docId: rootDoc.id,
      vaultId: vault.id,
    });

    expect(restoredDoc).toMatchObject({
      archivedAt: null,
      id: rootDoc.id,
    });

    const restoredChildDoc = await getWorkspaceDoc({
      db,
      docId: childDoc.id,
      vaultId: vault.id,
    });

    expect(restoredChildDoc).toMatchObject({
      archivedAt: null,
      id: childDoc.id,
      workspaceAreaId: secondArea.id,
    });
  });
});
