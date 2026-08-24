import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  areaSuggestionDocuments,
  areaSuggestions,
  documentChunks,
  documents,
  workspaceIndexes,
  workspaceAreaDocuments,
  workspaceAreas,
} from '@/db/schema';

import type { Db } from '@/db';
import type { WorkspaceArea, WorkspaceAreaIconName, WorkspaceAreaOrigin } from '@/db/schema';

export type WorkspaceAreaListItem = {
  chunkCount: number;
  createdAt: Date;
  description: string | null;
  documentCount: number;
  id: string;
  icon: WorkspaceAreaIconName;
  name: string;
  vaultId: string;
  origin: WorkspaceAreaOrigin;
  slug: string;
  updatedAt: Date;
};

export type CreateWorkspaceAreaInput = {
  db?: Db;
  description?: string | null;
  icon?: WorkspaceAreaIconName;
  name: string;
  vaultId: string;
};

export type UpsertWorkspaceAreaInput = {
  confidence?: number | null;
  db?: Db;
  description: string | null;
  documentLinks?: Array<{
    confidence?: number | null;
    documentId: string;
    reason?: string | null;
  }>;
  icon?: WorkspaceAreaIconName;
  name: string;
  vaultId: string;
  origin?: WorkspaceAreaOrigin;
  reason?: string | null;
  slug?: string | null;
};

export type UpdateWorkspaceAreaInput = {
  db?: Db;
  description: string | null;
  icon: WorkspaceAreaIconName;
  name: string;
  vaultId: string;
  workspaceAreaId: string;
};

export type RefreshWorkspaceAreaDocumentLinksSummary = {
  areasScanned: number;
  documentsLinked: number;
};

const autoLinkedAreaDocumentConfidence = 0.65;

function slugifyAreaName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return slug || 'area';
}

function getPathPrefix(path: string): string | null {
  const normalizedPath = path.trim().replace(/^\/+/u, '').toLowerCase();
  const [prefix] = normalizedPath.split('/');

  return prefix?.trim() || null;
}

function requireRow<TValue>(row: TValue | undefined, message: string): TValue {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export async function refreshWorkspaceAreaDocumentLinks({
  db = getDb(),
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
}): Promise<RefreshWorkspaceAreaDocumentLinksSummary> {
  const [workspaceIndex] = await db
    .select({
      vaultId: workspaceIndexes.vaultId,
    })
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, workspaceIndexId))
    .limit(1);

  if (!workspaceIndex) {
    return {
      areasScanned: 0,
      documentsLinked: 0,
    };
  }

  const areas = await db
    .select({
      id: workspaceAreas.id,
    })
    .from(workspaceAreas)
    .where(eq(workspaceAreas.vaultId, workspaceIndex.vaultId));

  if (areas.length === 0) {
    return {
      areasScanned: 0,
      documentsLinked: 0,
    };
  }

  const workspaceDocuments = await db
    .select({
      id: documents.id,
      path: documents.path,
    })
    .from(documents)
    .where(eq(documents.workspaceIndexId, workspaceIndexId));

  if (workspaceDocuments.length === 0) {
    return {
      areasScanned: areas.length,
      documentsLinked: 0,
    };
  }

  const existingLinks = await db
    .select({
      documentId: workspaceAreaDocuments.documentId,
      path: documents.path,
      workspaceAreaId: workspaceAreaDocuments.workspaceAreaId,
    })
    .from(workspaceAreaDocuments)
    .innerJoin(documents, eq(workspaceAreaDocuments.documentId, documents.id))
    .where(
      and(
        eq(workspaceAreaDocuments.vaultId, workspaceIndex.vaultId),
        eq(documents.workspaceIndexId, workspaceIndexId),
      ),
    );
  const linkedDocumentKeys = new Set(
    existingLinks.map((link) => `${link.workspaceAreaId}:${link.documentId}`),
  );
  const prefixAreaIds = new Map<string, Set<string>>();

  for (const link of existingLinks) {
    const prefix = getPathPrefix(link.path);

    if (!prefix) {
      continue;
    }

    const areaIds = prefixAreaIds.get(prefix) ?? new Set<string>();
    areaIds.add(link.workspaceAreaId);
    prefixAreaIds.set(prefix, areaIds);
  }

  const areaDocumentLinks = new Map<
    string,
    {
      confidence: number;
      documentId: string;
      vaultId: string;
      reason: string;
      workspaceAreaId: string;
    }
  >();

  for (const document of workspaceDocuments) {
    const prefix = getPathPrefix(document.path);

    if (!prefix) {
      continue;
    }

    const areaIds = prefixAreaIds.get(prefix);

    if (!areaIds || areaIds.size !== 1) {
      continue;
    }

    const [workspaceAreaId] = areaIds;

    if (!workspaceAreaId) {
      continue;
    }

    const documentKey = `${workspaceAreaId}:${document.id}`;

    if (linkedDocumentKeys.has(documentKey)) {
      continue;
    }

    areaDocumentLinks.set(documentKey, {
      confidence: autoLinkedAreaDocumentConfidence,
      documentId: document.id,
      reason: `Auto-linked after source sync because this document shares the established source path prefix "${prefix}/" with this accepted semantic area.`,
      vaultId: workspaceIndex.vaultId,
      workspaceAreaId,
    });
  }

  const values = [...areaDocumentLinks.values()];

  if (values.length === 0) {
    return {
      areasScanned: areas.length,
      documentsLinked: 0,
    };
  }

  const insertedLinks = await db
    .insert(workspaceAreaDocuments)
    .values(values)
    .onConflictDoNothing({
      target: [workspaceAreaDocuments.workspaceAreaId, workspaceAreaDocuments.documentId],
    })
    .returning({
      id: workspaceAreaDocuments.id,
    });

  return {
    areasScanned: areas.length,
    documentsLinked: insertedLinks.length,
  };
}

export async function listWorkspaceAreas({
  db = getDb(),
  vaultId,
}: {
  db?: Db;
  vaultId: string;
}): Promise<WorkspaceAreaListItem[]> {
  const areas = await db
    .select()
    .from(workspaceAreas)
    .where(eq(workspaceAreas.vaultId, vaultId))
    .orderBy(workspaceAreas.name);

  if (areas.length === 0) {
    return [];
  }

  const areaIds = areas.map((area) => area.id);
  const documentCountRows = await db
    .select({
      areaId: workspaceAreaDocuments.workspaceAreaId,
      value: count(workspaceAreaDocuments.documentId),
    })
    .from(workspaceAreaDocuments)
    .where(inArray(workspaceAreaDocuments.workspaceAreaId, areaIds))
    .groupBy(workspaceAreaDocuments.workspaceAreaId);
  const chunkCountRows = await db
    .select({
      areaId: workspaceAreaDocuments.workspaceAreaId,
      value: count(documentChunks.id),
    })
    .from(workspaceAreaDocuments)
    .innerJoin(documentChunks, eq(workspaceAreaDocuments.documentId, documentChunks.documentId))
    .where(inArray(workspaceAreaDocuments.workspaceAreaId, areaIds))
    .groupBy(workspaceAreaDocuments.workspaceAreaId);
  const documentCountByAreaId = new Map(documentCountRows.map((row) => [row.areaId, row.value]));
  const chunkCountByAreaId = new Map(chunkCountRows.map((row) => [row.areaId, row.value]));

  return areas.map((area) => ({
    chunkCount: chunkCountByAreaId.get(area.id) ?? 0,
    createdAt: area.createdAt,
    description: area.description,
    documentCount: documentCountByAreaId.get(area.id) ?? 0,
    icon: area.icon,
    id: area.id,
    name: area.name,
    origin: area.origin,
    slug: area.slug,
    updatedAt: area.updatedAt,
    vaultId: area.vaultId,
  }));
}

export async function getWorkspaceArea({
  db = getDb(),
  vaultId,
  workspaceAreaId,
}: {
  db?: Db;
  vaultId: string;
  workspaceAreaId: string;
}): Promise<WorkspaceArea | null> {
  const [area] = await db
    .select()
    .from(workspaceAreas)
    .where(and(eq(workspaceAreas.id, workspaceAreaId), eq(workspaceAreas.vaultId, vaultId)))
    .limit(1);

  return area ?? null;
}

export async function getWorkspaceAreaByIdOrSlug({
  db = getDb(),
  vaultId,
  workspaceAreaIdentifier,
}: {
  db?: Db;
  vaultId: string;
  workspaceAreaIdentifier: string;
}): Promise<WorkspaceArea | null> {
  const normalizedIdentifier = workspaceAreaIdentifier.trim();

  if (!normalizedIdentifier) {
    return null;
  }

  const [area] = await db
    .select()
    .from(workspaceAreas)
    .where(
      and(
        eq(workspaceAreas.vaultId, vaultId),
        isUuid(normalizedIdentifier)
          ? or(
              eq(workspaceAreas.id, normalizedIdentifier),
              eq(workspaceAreas.slug, normalizedIdentifier),
            )
          : eq(workspaceAreas.slug, normalizedIdentifier),
      ),
    )
    .limit(1);

  return area ?? null;
}

export async function upsertWorkspaceArea({
  confidence = null,
  db = getDb(),
  description,
  documentLinks = [],
  icon,
  name,
  origin = 'ai-discovered',
  reason = null,
  slug,
  vaultId,
}: UpsertWorkspaceAreaInput): Promise<WorkspaceArea> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [area] = await tx
      .insert(workspaceAreas)
      .values({
        confidence,
        description,
        icon: icon ?? 'folder',
        name,
        origin,
        reason,
        slug: slug ?? slugifyAreaName(name),
        vaultId,
      })
      .onConflictDoUpdate({
        set: {
          confidence,
          description,
          ...(icon ? { icon } : {}),
          name,
          origin,
          reason,
          updatedAt: now,
        },
        target: [workspaceAreas.vaultId, workspaceAreas.slug],
      })
      .returning();
    const workspaceArea = requireRow(area, 'Failed to create workspace area.');

    if (documentLinks.length > 0) {
      await tx
        .insert(workspaceAreaDocuments)
        .values(
          documentLinks.map((documentLink) => ({
            confidence: documentLink.confidence ?? null,
            documentId: documentLink.documentId,
            reason: documentLink.reason ?? null,
            vaultId,
            workspaceAreaId: workspaceArea.id,
          })),
        )
        .onConflictDoUpdate({
          set: {
            confidence: sql`excluded.confidence`,
            reason: sql`excluded.reason`,
          },
          target: [workspaceAreaDocuments.workspaceAreaId, workspaceAreaDocuments.documentId],
        });
    }

    return workspaceArea;
  });
}

export async function createWorkspaceArea({
  db = getDb(),
  description = null,
  icon = 'folder',
  name,
  vaultId,
}: CreateWorkspaceAreaInput): Promise<WorkspaceArea> {
  const baseSlug = slugifyAreaName(name);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const [area] = await db
      .insert(workspaceAreas)
      .values({
        description,
        icon,
        name,
        origin: 'manual',
        slug,
        vaultId,
      })
      .onConflictDoNothing({
        target: [workspaceAreas.vaultId, workspaceAreas.slug],
      })
      .returning();

    if (area) {
      return area;
    }
  }

  throw new Error('Failed to create a unique workspace area slug.');
}

export async function updateWorkspaceArea({
  db = getDb(),
  description,
  icon,
  name,
  vaultId,
  workspaceAreaId,
}: UpdateWorkspaceAreaInput): Promise<WorkspaceArea | null> {
  const [area] = await db
    .update(workspaceAreas)
    .set({
      description,
      icon,
      name,
      updatedAt: new Date(),
    })
    .where(and(eq(workspaceAreas.id, workspaceAreaId), eq(workspaceAreas.vaultId, vaultId)))
    .returning();

  return area ?? null;
}

export async function promoteAreaSuggestionToWorkspaceArea({
  db = getDb(),
  suggestionId,
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
  suggestionId: string;
}): Promise<WorkspaceArea | null> {
  const [suggestion] = await db
    .select({
      confidence: areaSuggestions.confidence,
      description: areaSuggestions.description,
      id: areaSuggestions.id,
      name: areaSuggestions.name,
      reason: areaSuggestions.reason,
      vaultId: workspaceIndexes.vaultId,
    })
    .from(areaSuggestions)
    .innerJoin(workspaceIndexes, eq(areaSuggestions.workspaceIndexId, workspaceIndexes.id))
    .where(
      and(
        eq(areaSuggestions.id, suggestionId),
        eq(areaSuggestions.workspaceIndexId, workspaceIndexId),
      ),
    )
    .limit(1);

  if (!suggestion) {
    return null;
  }

  const documentLinks = await db
    .select({
      confidence: areaSuggestionDocuments.confidence,
      documentId: areaSuggestionDocuments.documentId,
      reason: areaSuggestionDocuments.reason,
    })
    .from(areaSuggestionDocuments)
    .where(eq(areaSuggestionDocuments.suggestionId, suggestion.id));
  const workspaceArea = await upsertWorkspaceArea({
    confidence: suggestion.confidence,
    db,
    description: suggestion.description,
    documentLinks,
    name: suggestion.name,
    origin: 'ai-discovered',
    reason: suggestion.reason,
    vaultId: suggestion.vaultId,
  });

  await db
    .update(areaSuggestions)
    .set({
      promotedAreaId: workspaceArea.id,
      updatedAt: new Date(),
    })
    .where(eq(areaSuggestions.id, suggestion.id));

  return workspaceArea;
}

export async function getPrimaryWorkspaceIndex({
  db = getDb(),
  vaultId,
}: {
  db?: Db;
  vaultId: string;
}) {
  const [workspaceIndex] = await db
    .select()
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.vaultId, vaultId))
    .orderBy(desc(workspaceIndexes.updatedAt))
    .limit(1);

  return workspaceIndex ?? null;
}
