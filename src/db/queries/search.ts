import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  documents,
  workspaceAreas,
  workspaceDocs,
  workspaceIndexes,
  workspaceSources,
} from '@/db/schema';

import type { Db } from '@/db';
import type { WorkspaceSourceType } from '@/db/schema';

export type VaultSearchEntry =
  | {
      id: string;
      kind: 'doc';
      slug: string;
      subtitle: string;
      title: string;
      updatedAt: Date;
      workspaceDocId: string;
    }
  | {
      documentId: string;
      id: string;
      kind: 'source-document';
      sourceName: string;
      sourceType: WorkspaceSourceType;
      subtitle: string;
      title: string;
      updatedAt: Date;
    };

export type VaultSearchResult = {
  entries: VaultSearchEntry[];
  sourceCount: number;
};

function getSearchPattern(query: string): string {
  return `%${query.trim().replace(/[%_]/gu, '\\$&')}%`;
}

export async function searchVaultKnowledge({
  db = getDb(),
  limit = 12,
  query,
  vaultId,
}: {
  db?: Db;
  limit?: number;
  vaultId: string;
  query: string;
}): Promise<VaultSearchResult> {
  const normalizedQuery = query.trim();
  const searchPattern = normalizedQuery ? getSearchPattern(normalizedQuery) : null;
  const [sourceCountRow] = await db
    .select({
      value: count(workspaceSources.id),
    })
    .from(workspaceSources)
    .innerJoin(workspaceIndexes, eq(workspaceSources.workspaceIndexId, workspaceIndexes.id))
    .where(eq(workspaceIndexes.vaultId, vaultId));
  const sourceCount = sourceCountRow?.value ?? 0;
  const docFilters = [
    eq(workspaceDocs.vaultId, vaultId),
    isNull(workspaceDocs.archivedAt),
    ...(searchPattern
      ? [or(ilike(workspaceDocs.title, searchPattern), ilike(workspaceDocs.content, searchPattern))]
      : []),
  ];
  const sourceDocumentFilters = [
    eq(workspaceIndexes.vaultId, vaultId),
    ...(searchPattern
      ? [
          or(
            ilike(documents.title, searchPattern),
            ilike(documents.path, searchPattern),
            ilike(documents.content, searchPattern),
            ilike(workspaceSources.name, searchPattern),
          ),
        ]
      : []),
  ];
  const [docRows, sourceDocumentRows] = await Promise.all([
    db
      .select({
        areaName: workspaceAreas.name,
        id: workspaceDocs.id,
        slug: workspaceDocs.slug,
        title: workspaceDocs.title,
        updatedAt: workspaceDocs.updatedAt,
      })
      .from(workspaceDocs)
      .innerJoin(workspaceAreas, eq(workspaceDocs.workspaceAreaId, workspaceAreas.id))
      .where(and(...docFilters))
      .orderBy(desc(workspaceDocs.updatedAt))
      .limit(limit),
    db
      .select({
        id: documents.id,
        path: documents.path,
        sourceName: workspaceSources.name,
        sourceType: documents.sourceType,
        title: documents.title,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .innerJoin(workspaceIndexes, eq(documents.workspaceIndexId, workspaceIndexes.id))
      .innerJoin(workspaceSources, eq(documents.sourceId, workspaceSources.id))
      .where(and(...sourceDocumentFilters))
      .orderBy(desc(documents.updatedAt))
      .limit(limit),
  ]);
  const entries: VaultSearchEntry[] = [
    ...docRows.map((doc) => ({
      id: `doc-${doc.id}`,
      kind: 'doc' as const,
      slug: doc.slug,
      subtitle: doc.areaName,
      title: doc.title,
      updatedAt: doc.updatedAt,
      workspaceDocId: doc.id,
    })),
    ...sourceDocumentRows.map((document) => ({
      documentId: document.id,
      id: `source-document-${document.id}`,
      kind: 'source-document' as const,
      sourceName: document.sourceName,
      sourceType: document.sourceType,
      subtitle: `${document.sourceName} / ${document.path}`,
      title: document.title,
      updatedAt: document.updatedAt,
    })),
  ];

  return {
    entries,
    sourceCount,
  };
}
