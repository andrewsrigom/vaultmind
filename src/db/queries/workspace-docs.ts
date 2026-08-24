import { and, asc, count, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { documents, workspaceAreas, workspaceDocs, workspaceIndexes } from '@/db/schema';

import type { Db } from '@/db';
import type { JsonValue, WorkspaceDoc, WorkspaceDocStatus, WorkspaceDocType } from '@/db/schema';

export type WorkspaceDocListItem = {
  archivedAt: Date | null;
  createdAt: Date;
  docType: WorkspaceDocType;
  id: string;
  includeInAskAi: boolean;
  isFavorite: boolean;
  metadata: JsonValue;
  vaultId: string;
  parentDocId: string | null;
  position: number;
  publishedAt: Date | null;
  publishedContent: string | null;
  publishedTitle: string | null;
  slug: string;
  status: WorkspaceDocStatus;
  tags: string[];
  title: string;
  updatedAt: Date;
  workspaceAreaId: string;
};

export type WorkspaceDocDetail = WorkspaceDoc & {
  areaName: string;
  areaSlug: string;
};

export type WorkspaceAreaHomeDoc = {
  id: string;
  slug: string;
  title: string;
  workspaceAreaId: string;
};

export type CreateWorkspaceDocInput = {
  content?: string;
  db?: Db;
  docType?: WorkspaceDocType;
  metadata?: JsonValue;
  vaultId: string;
  parentDocId?: string | null;
  status?: WorkspaceDocStatus;
  tags?: string[];
  title: string;
  workspaceAreaId: string;
};

export type UpdateWorkspaceDocInput = {
  content: string;
  db?: Db;
  docId: string;
  vaultId: string;
  title: string;
};

export type GetWorkspaceDocInput = {
  db?: Db;
  docId: string;
  includeArchived?: boolean;
  vaultId: string;
};

export type MoveWorkspaceDocInput = {
  db?: Db;
  docId: string;
  vaultId: string;
  parentDocId: string | null;
  workspaceAreaId: string;
};

export type PublishWorkspaceDocInput = {
  db?: Db;
  docId: string;
  vaultId: string;
};

export type SetWorkspaceDocFavoriteInput = {
  db?: Db;
  docId: string;
  isFavorite: boolean;
  vaultId: string;
};

type WorkspaceDocTreeRow = {
  id: string;
  parentDocId: string | null;
  workspaceAreaId: string;
};

const workspaceAreaHomeDocMetadata = {
  kind: 'space-home',
  source: 'space',
} satisfies JsonValue;

function slugifyDocTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return slug || 'doc';
}

function requireRow<TValue>(row: TValue | undefined, message: string): TValue {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

function collectDescendantDocIds(rows: WorkspaceDocTreeRow[], docId: string): string[] {
  const childrenByParentDocId = new Map<string, string[]>();

  for (const row of rows) {
    if (!row.parentDocId) {
      continue;
    }

    const children = childrenByParentDocId.get(row.parentDocId) ?? [];
    children.push(row.id);
    childrenByParentDocId.set(row.parentDocId, children);
  }

  const descendants: string[] = [];
  const pendingDocIds = [...(childrenByParentDocId.get(docId) ?? [])];

  while (pendingDocIds.length > 0) {
    const descendantDocId = pendingDocIds.pop();

    if (!descendantDocId) {
      continue;
    }

    descendants.push(descendantDocId);
    pendingDocIds.push(...(childrenByParentDocId.get(descendantDocId) ?? []));
  }

  return descendants;
}

function getWorkspaceDocAskAiExternalId(docId: string): string {
  return `workspace-doc:${docId}`;
}

async function deleteIndexedWorkspaceDocRows({
  db,
  docIds,
  vaultId,
}: {
  db: Db;
  docIds: string[];
  vaultId: string;
}): Promise<void> {
  if (docIds.length === 0) {
    return;
  }

  const indexedDocuments = await db
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(workspaceIndexes, eq(documents.workspaceIndexId, workspaceIndexes.id))
    .where(
      and(
        inArray(documents.externalId, docIds.map(getWorkspaceDocAskAiExternalId)),
        eq(documents.sourceType, 'workspace-doc'),
        eq(workspaceIndexes.vaultId, vaultId),
      ),
    );
  const indexedDocumentIds = indexedDocuments.map((document) => document.id);

  if (indexedDocumentIds.length === 0) {
    return;
  }

  await db.delete(documents).where(inArray(documents.id, indexedDocumentIds));
}

async function getUniqueWorkspaceDocSlug({
  db,
  docId,
  parentDocId,
  title,
  vaultId,
  workspaceAreaId,
}: {
  db: Pick<Db, 'select'>;
  docId: string;
  vaultId: string;
  parentDocId: string | null;
  title: string;
  workspaceAreaId: string;
}): Promise<string> {
  const baseSlug = slugifyDocTitle(title.trim() || 'Untitled');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const [conflict] = await db
      .select({
        id: workspaceDocs.id,
      })
      .from(workspaceDocs)
      .where(
        and(
          eq(workspaceDocs.vaultId, vaultId),
          eq(workspaceDocs.workspaceAreaId, workspaceAreaId),
          parentDocId
            ? eq(workspaceDocs.parentDocId, parentDocId)
            : isNull(workspaceDocs.parentDocId),
          eq(workspaceDocs.slug, slug),
          ne(workspaceDocs.id, docId),
        ),
      )
      .limit(1);

    if (!conflict) {
      return slug;
    }
  }

  throw new Error('Failed to create a unique workspace doc slug.');
}

export async function listWorkspaceDocs({
  db = getDb(),
  vaultId,
}: {
  db?: Db;
  vaultId: string;
}): Promise<WorkspaceDocListItem[]> {
  const docs = await db
    .select({
      archivedAt: workspaceDocs.archivedAt,
      createdAt: workspaceDocs.createdAt,
      docType: workspaceDocs.docType,
      id: workspaceDocs.id,
      includeInAskAi: workspaceDocs.includeInAskAi,
      isFavorite: workspaceDocs.isFavorite,
      metadata: workspaceDocs.metadata,
      parentDocId: workspaceDocs.parentDocId,
      position: workspaceDocs.position,
      publishedAt: workspaceDocs.publishedAt,
      publishedContent: workspaceDocs.publishedContent,
      publishedTitle: workspaceDocs.publishedTitle,
      slug: workspaceDocs.slug,
      status: workspaceDocs.status,
      tags: workspaceDocs.tags,
      title: workspaceDocs.title,
      updatedAt: workspaceDocs.updatedAt,
      vaultId: workspaceDocs.vaultId,
      workspaceAreaId: workspaceDocs.workspaceAreaId,
    })
    .from(workspaceDocs)
    .where(and(eq(workspaceDocs.vaultId, vaultId), isNull(workspaceDocs.archivedAt)))
    .orderBy(
      asc(workspaceDocs.workspaceAreaId),
      asc(workspaceDocs.parentDocId),
      asc(workspaceDocs.position),
      asc(workspaceDocs.title),
    );

  return docs;
}

export async function listArchivedWorkspaceDocs({
  db = getDb(),
  vaultId,
}: {
  db?: Db;
  vaultId: string;
}): Promise<WorkspaceDocListItem[]> {
  const docs = await db
    .select({
      archivedAt: workspaceDocs.archivedAt,
      createdAt: workspaceDocs.createdAt,
      docType: workspaceDocs.docType,
      id: workspaceDocs.id,
      includeInAskAi: workspaceDocs.includeInAskAi,
      isFavorite: workspaceDocs.isFavorite,
      metadata: workspaceDocs.metadata,
      parentDocId: workspaceDocs.parentDocId,
      position: workspaceDocs.position,
      publishedAt: workspaceDocs.publishedAt,
      publishedContent: workspaceDocs.publishedContent,
      publishedTitle: workspaceDocs.publishedTitle,
      slug: workspaceDocs.slug,
      status: workspaceDocs.status,
      tags: workspaceDocs.tags,
      title: workspaceDocs.title,
      updatedAt: workspaceDocs.updatedAt,
      vaultId: workspaceDocs.vaultId,
      workspaceAreaId: workspaceDocs.workspaceAreaId,
    })
    .from(workspaceDocs)
    .where(and(eq(workspaceDocs.vaultId, vaultId), isNotNull(workspaceDocs.archivedAt)))
    .orderBy(asc(workspaceDocs.archivedAt), asc(workspaceDocs.title));

  return docs;
}

export async function listWorkspaceDocChildren({
  db = getDb(),
  docId,
  vaultId,
}: {
  db?: Db;
  docId: string;
  vaultId: string;
}): Promise<WorkspaceDocListItem[]> {
  const docs = await db
    .select({
      archivedAt: workspaceDocs.archivedAt,
      createdAt: workspaceDocs.createdAt,
      docType: workspaceDocs.docType,
      id: workspaceDocs.id,
      includeInAskAi: workspaceDocs.includeInAskAi,
      isFavorite: workspaceDocs.isFavorite,
      metadata: workspaceDocs.metadata,
      parentDocId: workspaceDocs.parentDocId,
      position: workspaceDocs.position,
      publishedAt: workspaceDocs.publishedAt,
      publishedContent: workspaceDocs.publishedContent,
      publishedTitle: workspaceDocs.publishedTitle,
      slug: workspaceDocs.slug,
      status: workspaceDocs.status,
      tags: workspaceDocs.tags,
      title: workspaceDocs.title,
      updatedAt: workspaceDocs.updatedAt,
      vaultId: workspaceDocs.vaultId,
      workspaceAreaId: workspaceDocs.workspaceAreaId,
    })
    .from(workspaceDocs)
    .where(
      and(
        eq(workspaceDocs.vaultId, vaultId),
        eq(workspaceDocs.parentDocId, docId),
        isNull(workspaceDocs.archivedAt),
      ),
    )
    .orderBy(asc(workspaceDocs.position), asc(workspaceDocs.title));

  return docs;
}

export async function getWorkspaceDoc({
  db = getDb(),
  docId,
  includeArchived = false,
  vaultId,
}: GetWorkspaceDocInput): Promise<WorkspaceDocDetail | null> {
  const [doc] = await db
    .select({
      archivedAt: workspaceDocs.archivedAt,
      areaName: workspaceAreas.name,
      areaSlug: workspaceAreas.slug,
      content: workspaceDocs.content,
      createdAt: workspaceDocs.createdAt,
      docType: workspaceDocs.docType,
      id: workspaceDocs.id,
      includeInAskAi: workspaceDocs.includeInAskAi,
      isFavorite: workspaceDocs.isFavorite,
      metadata: workspaceDocs.metadata,
      parentDocId: workspaceDocs.parentDocId,
      position: workspaceDocs.position,
      publishedAt: workspaceDocs.publishedAt,
      publishedContent: workspaceDocs.publishedContent,
      publishedTitle: workspaceDocs.publishedTitle,
      slug: workspaceDocs.slug,
      status: workspaceDocs.status,
      tags: workspaceDocs.tags,
      title: workspaceDocs.title,
      updatedAt: workspaceDocs.updatedAt,
      vaultId: workspaceDocs.vaultId,
      workspaceAreaId: workspaceDocs.workspaceAreaId,
    })
    .from(workspaceDocs)
    .innerJoin(workspaceAreas, eq(workspaceDocs.workspaceAreaId, workspaceAreas.id))
    .where(
      includeArchived
        ? and(eq(workspaceDocs.id, docId), eq(workspaceDocs.vaultId, vaultId))
        : and(
            eq(workspaceDocs.id, docId),
            eq(workspaceDocs.vaultId, vaultId),
            isNull(workspaceDocs.archivedAt),
          ),
    )
    .limit(1);

  return doc ?? null;
}

export async function getWorkspaceAreaHomeDoc({
  db = getDb(),
  vaultId,
  workspaceAreaId,
}: {
  db?: Db;
  vaultId: string;
  workspaceAreaId: string;
}): Promise<WorkspaceAreaHomeDoc | null> {
  const [homeDoc] = await db
    .select({
      id: workspaceDocs.id,
      slug: workspaceDocs.slug,
      title: workspaceDocs.title,
      workspaceAreaId: workspaceDocs.workspaceAreaId,
    })
    .from(workspaceDocs)
    .where(
      and(
        eq(workspaceDocs.vaultId, vaultId),
        eq(workspaceDocs.workspaceAreaId, workspaceAreaId),
        isNull(workspaceDocs.parentDocId),
        isNull(workspaceDocs.archivedAt),
        sql`${workspaceDocs.metadata}->>'kind' = 'space-home'`,
      ),
    )
    .orderBy(asc(workspaceDocs.position), asc(workspaceDocs.createdAt))
    .limit(1);

  return homeDoc ?? null;
}

export async function getOrCreateWorkspaceAreaHomeDoc({
  db = getDb(),
  vaultId,
  workspaceAreaId,
}: {
  db?: Db;
  vaultId: string;
  workspaceAreaId: string;
}): Promise<WorkspaceAreaHomeDoc | null> {
  const existingHomeDoc = await getWorkspaceAreaHomeDoc({
    db,
    vaultId,
    workspaceAreaId,
  });

  if (existingHomeDoc) {
    return existingHomeDoc;
  }

  const [area] = await db
    .select({
      description: workspaceAreas.description,
      id: workspaceAreas.id,
      name: workspaceAreas.name,
    })
    .from(workspaceAreas)
    .where(and(eq(workspaceAreas.id, workspaceAreaId), eq(workspaceAreas.vaultId, vaultId)))
    .limit(1);

  if (!area) {
    return null;
  }

  const description = area.description?.trim();
  const content = description ? `${description}\n\n` : '';
  const doc = await createWorkspaceDoc({
    content,
    db,
    docType: 'note',
    metadata: workspaceAreaHomeDocMetadata,
    status: 'published',
    tags: ['space-home'],
    title: area.name,
    vaultId,
    workspaceAreaId: area.id,
  });

  if (!doc) {
    return null;
  }

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    workspaceAreaId: doc.workspaceAreaId,
  };
}

export async function createWorkspaceDoc({
  content = '',
  db = getDb(),
  docType = 'note',
  metadata = {},
  parentDocId = null,
  status = 'draft',
  tags = [],
  title,
  vaultId,
  workspaceAreaId,
}: CreateWorkspaceDocInput): Promise<WorkspaceDoc | null> {
  return db.transaction(async (tx) => {
    const [area] = await tx
      .select({
        id: workspaceAreas.id,
      })
      .from(workspaceAreas)
      .where(and(eq(workspaceAreas.id, workspaceAreaId), eq(workspaceAreas.vaultId, vaultId)))
      .limit(1);

    if (!area) {
      return null;
    }

    if (parentDocId) {
      const [parentDoc] = await tx
        .select({
          id: workspaceDocs.id,
        })
        .from(workspaceDocs)
        .where(
          and(
            eq(workspaceDocs.id, parentDocId),
            eq(workspaceDocs.vaultId, vaultId),
            eq(workspaceDocs.workspaceAreaId, workspaceAreaId),
            isNull(workspaceDocs.archivedAt),
          ),
        )
        .limit(1);

      if (!parentDoc) {
        return null;
      }
    }

    const [siblingCount] = await tx
      .select({
        value: count(workspaceDocs.id),
      })
      .from(workspaceDocs)
      .where(
        and(
          eq(workspaceDocs.vaultId, vaultId),
          eq(workspaceDocs.workspaceAreaId, workspaceAreaId),
          parentDocId
            ? eq(workspaceDocs.parentDocId, parentDocId)
            : isNull(workspaceDocs.parentDocId),
          isNull(workspaceDocs.archivedAt),
        ),
      );
    const position = requireRow(siblingCount, 'Failed to count sibling docs.').value;
    const normalizedTitle = title.trim() || 'Untitled';
    const baseSlug = slugifyDocTitle(normalizedTitle);
    const publishedAt = status === 'published' ? new Date() : null;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const [doc] = await tx
        .insert(workspaceDocs)
        .values({
          content,
          docType,
          metadata,
          parentDocId,
          position,
          publishedAt,
          publishedContent: publishedAt ? content : null,
          publishedTitle: publishedAt ? normalizedTitle : null,
          slug,
          status,
          tags,
          title: normalizedTitle,
          vaultId,
          workspaceAreaId,
        })
        .onConflictDoNothing()
        .returning();

      if (doc) {
        return doc;
      }
    }

    throw new Error('Failed to create a unique workspace doc slug.');
  });
}

export async function updateWorkspaceDoc({
  content,
  db = getDb(),
  docId,
  title,
  vaultId,
}: UpdateWorkspaceDocInput): Promise<WorkspaceDoc | null> {
  const normalizedTitle = title.trim() || 'Untitled';
  const [doc] = await db
    .update(workspaceDocs)
    .set({
      content,
      title: normalizedTitle,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceDocs.id, docId),
        eq(workspaceDocs.vaultId, vaultId),
        isNull(workspaceDocs.archivedAt),
      ),
    )
    .returning();

  return doc ?? null;
}

export async function setWorkspaceDocFavorite({
  db = getDb(),
  docId,
  isFavorite,
  vaultId,
}: SetWorkspaceDocFavoriteInput): Promise<WorkspaceDoc | null> {
  const [doc] = await db
    .update(workspaceDocs)
    .set({
      isFavorite,
    })
    .where(
      and(
        eq(workspaceDocs.id, docId),
        eq(workspaceDocs.vaultId, vaultId),
        isNull(workspaceDocs.archivedAt),
      ),
    )
    .returning();

  return doc ?? null;
}

export async function moveWorkspaceDoc({
  db = getDb(),
  docId,
  parentDocId,
  vaultId,
  workspaceAreaId,
}: MoveWorkspaceDocInput): Promise<WorkspaceDoc | null> {
  return db.transaction(async (tx) => {
    const [currentDoc] = await tx
      .select({
        id: workspaceDocs.id,
        parentDocId: workspaceDocs.parentDocId,
        title: workspaceDocs.title,
        workspaceAreaId: workspaceDocs.workspaceAreaId,
      })
      .from(workspaceDocs)
      .where(
        and(
          eq(workspaceDocs.id, docId),
          eq(workspaceDocs.vaultId, vaultId),
          isNull(workspaceDocs.archivedAt),
        ),
      )
      .limit(1);

    if (!currentDoc) {
      return null;
    }

    const rows = await tx
      .select({
        id: workspaceDocs.id,
        parentDocId: workspaceDocs.parentDocId,
        workspaceAreaId: workspaceDocs.workspaceAreaId,
      })
      .from(workspaceDocs)
      .where(and(eq(workspaceDocs.vaultId, vaultId), isNull(workspaceDocs.archivedAt)));
    const descendantDocIds = collectDescendantDocIds(rows, docId);

    if (parentDocId === docId || descendantDocIds.includes(parentDocId ?? '')) {
      return null;
    }

    const targetWorkspaceAreaId = parentDocId
      ? rows.find((row) => row.id === parentDocId)?.workspaceAreaId
      : workspaceAreaId;

    if (!targetWorkspaceAreaId) {
      return null;
    }

    const [targetArea] = await tx
      .select({
        id: workspaceAreas.id,
      })
      .from(workspaceAreas)
      .where(and(eq(workspaceAreas.id, targetWorkspaceAreaId), eq(workspaceAreas.vaultId, vaultId)))
      .limit(1);

    if (!targetArea) {
      return null;
    }

    const [siblingCount] = await tx
      .select({
        value: count(workspaceDocs.id),
      })
      .from(workspaceDocs)
      .where(
        and(
          eq(workspaceDocs.vaultId, vaultId),
          eq(workspaceDocs.workspaceAreaId, targetWorkspaceAreaId),
          parentDocId
            ? eq(workspaceDocs.parentDocId, parentDocId)
            : isNull(workspaceDocs.parentDocId),
          ne(workspaceDocs.id, docId),
          isNull(workspaceDocs.archivedAt),
        ),
      );
    const position = requireRow(siblingCount, 'Failed to count sibling docs.').value;
    const slug = await getUniqueWorkspaceDocSlug({
      db: tx,
      docId,
      parentDocId,
      title: currentDoc.title,
      vaultId,
      workspaceAreaId: targetWorkspaceAreaId,
    });
    const now = new Date();

    const [doc] = await tx
      .update(workspaceDocs)
      .set({
        parentDocId,
        position,
        slug,
        updatedAt: now,
        workspaceAreaId: targetWorkspaceAreaId,
      })
      .where(
        and(
          eq(workspaceDocs.id, docId),
          eq(workspaceDocs.vaultId, vaultId),
          isNull(workspaceDocs.archivedAt),
        ),
      )
      .returning();

    if (!doc) {
      return null;
    }

    if (descendantDocIds.length > 0) {
      await tx
        .update(workspaceDocs)
        .set({
          updatedAt: now,
          workspaceAreaId: targetWorkspaceAreaId,
        })
        .where(
          and(
            eq(workspaceDocs.vaultId, vaultId),
            inArray(workspaceDocs.id, descendantDocIds),
            isNull(workspaceDocs.archivedAt),
          ),
        );
    }

    return doc;
  });
}

export async function archiveWorkspaceDoc({
  db = getDb(),
  docId,
  vaultId,
}: PublishWorkspaceDocInput): Promise<WorkspaceDoc | null> {
  const archiveResult = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: workspaceDocs.id,
        parentDocId: workspaceDocs.parentDocId,
        workspaceAreaId: workspaceDocs.workspaceAreaId,
      })
      .from(workspaceDocs)
      .where(and(eq(workspaceDocs.vaultId, vaultId), isNull(workspaceDocs.archivedAt)));
    const targetDoc = rows.find((row) => row.id === docId);

    if (!targetDoc) {
      return null;
    }

    const archivedAt = new Date();
    const docIds = [docId, ...collectDescendantDocIds(rows, docId)];
    const archivedDocs = await tx
      .update(workspaceDocs)
      .set({
        archivedAt,
        includeInAskAi: false,
        updatedAt: archivedAt,
      })
      .where(and(eq(workspaceDocs.vaultId, vaultId), inArray(workspaceDocs.id, docIds)))
      .returning();

    return {
      doc: archivedDocs.find((doc) => doc.id === docId) ?? null,
      docIds,
    };
  });

  if (!archiveResult?.doc) {
    return null;
  }

  await deleteIndexedWorkspaceDocRows({
    db,
    docIds: archiveResult.docIds,
    vaultId,
  });

  return archiveResult.doc;
}

export async function restoreWorkspaceDoc({
  db = getDb(),
  docId,
  vaultId,
}: PublishWorkspaceDocInput): Promise<WorkspaceDoc | null> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: workspaceDocs.id,
        parentDocId: workspaceDocs.parentDocId,
        workspaceAreaId: workspaceDocs.workspaceAreaId,
      })
      .from(workspaceDocs)
      .where(and(eq(workspaceDocs.vaultId, vaultId), isNotNull(workspaceDocs.archivedAt)));
    const targetDoc = rows.find((row) => row.id === docId);

    if (!targetDoc) {
      return null;
    }

    const restoredAt = new Date();
    const docIds = [docId, ...collectDescendantDocIds(rows, docId)];
    const restoredDocs = await tx
      .update(workspaceDocs)
      .set({
        archivedAt: null,
        updatedAt: restoredAt,
      })
      .where(and(eq(workspaceDocs.vaultId, vaultId), inArray(workspaceDocs.id, docIds)))
      .returning();

    return restoredDocs.find((doc) => doc.id === docId) ?? null;
  });
}

export async function publishWorkspaceDoc({
  db = getDb(),
  docId,
  vaultId,
}: PublishWorkspaceDocInput): Promise<WorkspaceDoc | null> {
  const [existingDoc] = await db
    .select({
      content: workspaceDocs.content,
      title: workspaceDocs.title,
    })
    .from(workspaceDocs)
    .where(
      and(
        eq(workspaceDocs.id, docId),
        eq(workspaceDocs.vaultId, vaultId),
        isNull(workspaceDocs.archivedAt),
      ),
    )
    .limit(1);

  if (!existingDoc) {
    return null;
  }

  const now = new Date();
  const [doc] = await db
    .update(workspaceDocs)
    .set({
      publishedAt: now,
      publishedContent: existingDoc.content,
      publishedTitle: existingDoc.title,
      status: 'published',
      updatedAt: now,
    })
    .where(
      and(
        eq(workspaceDocs.id, docId),
        eq(workspaceDocs.vaultId, vaultId),
        isNull(workspaceDocs.archivedAt),
      ),
    )
    .returning();

  return doc ?? null;
}

export async function unpublishWorkspaceDoc({
  db = getDb(),
  docId,
  vaultId,
}: PublishWorkspaceDocInput): Promise<WorkspaceDoc | null> {
  const now = new Date();
  const [doc] = await db
    .update(workspaceDocs)
    .set({
      publishedAt: null,
      publishedContent: null,
      publishedTitle: null,
      status: 'draft',
      updatedAt: now,
    })
    .where(
      and(
        eq(workspaceDocs.id, docId),
        eq(workspaceDocs.vaultId, vaultId),
        isNull(workspaceDocs.archivedAt),
      ),
    )
    .returning();

  return doc ?? null;
}
