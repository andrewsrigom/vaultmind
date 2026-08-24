import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  documentChunks,
  documents,
  workspaceAreaDocuments,
  workspaceIndexes,
  workspaceSources,
} from '@/db/schema';

import type { Db } from '@/db';
import type { WorkspaceSourceType } from '@/db/schema';

export type VaultDocument = {
  content: string;
  contentHash: string;
  id: string;
  path: string;
  sourceId: string;
  sourceName: string;
  sourceType: WorkspaceSourceType;
  title: string;
  updatedAt: Date;
  workspaceIndexId: string;
};

export type WorkspaceIndexDocumentListItem = {
  chunkCount: number;
  contentHash: string;
  id: string;
  path: string;
  sourceId: string;
  sourceName: string;
  sourceType: WorkspaceSourceType;
  title: string;
  updatedAt: Date;
};

export async function getVaultDocument(input: {
  db?: Db;
  documentId: string;
  vaultId: string;
}): Promise<VaultDocument | null> {
  const db = input.db ?? getDb();
  const [document] = await db
    .select({
      content: documents.content,
      contentHash: documents.contentHash,
      id: documents.id,
      path: documents.path,
      sourceId: documents.sourceId,
      sourceName: workspaceSources.name,
      sourceType: documents.sourceType,
      title: documents.title,
      updatedAt: documents.updatedAt,
      workspaceIndexId: documents.workspaceIndexId,
    })
    .from(documents)
    .innerJoin(workspaceIndexes, eq(documents.workspaceIndexId, workspaceIndexes.id))
    .innerJoin(workspaceSources, eq(documents.sourceId, workspaceSources.id))
    .where(and(eq(documents.id, input.documentId), eq(workspaceIndexes.vaultId, input.vaultId)))
    .limit(1);

  return document ?? null;
}

export async function listWorkspaceIndexDocuments(input: {
  db?: Db;
  workspaceIndexId: string;
  sourceId?: string | null;
}): Promise<WorkspaceIndexDocumentListItem[]> {
  const db = input.db ?? getDb();
  const filters = [
    eq(documents.workspaceIndexId, input.workspaceIndexId),
    ...(input.sourceId ? [eq(documents.sourceId, input.sourceId)] : []),
  ];
  const documentRows = await db
    .select({
      contentHash: documents.contentHash,
      id: documents.id,
      path: documents.path,
      sourceId: documents.sourceId,
      sourceName: workspaceSources.name,
      sourceType: documents.sourceType,
      title: documents.title,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .innerJoin(workspaceSources, eq(documents.sourceId, workspaceSources.id))
    .where(and(...filters))
    .orderBy(desc(documents.updatedAt));

  if (documentRows.length === 0) {
    return [];
  }

  const chunkCountRows = await db
    .select({
      documentId: documentChunks.documentId,
      value: count(documentChunks.id),
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.workspaceIndexId, input.workspaceIndexId),
        ...(input.sourceId ? [eq(documentChunks.sourceId, input.sourceId)] : []),
      ),
    )
    .groupBy(documentChunks.documentId);
  const chunkCountByDocumentId = new Map(chunkCountRows.map((row) => [row.documentId, row.value]));

  return documentRows.map((documentRow) => ({
    ...documentRow,
    chunkCount: chunkCountByDocumentId.get(documentRow.id) ?? 0,
  }));
}

export async function listWorkspaceAreaDocuments(input: {
  db?: Db;
  vaultId: string;
  workspaceAreaId: string;
}): Promise<WorkspaceIndexDocumentListItem[]> {
  const db = input.db ?? getDb();
  const documentRows = await db
    .select({
      contentHash: documents.contentHash,
      id: documents.id,
      path: documents.path,
      sourceId: documents.sourceId,
      sourceName: workspaceSources.name,
      sourceType: documents.sourceType,
      title: documents.title,
      updatedAt: documents.updatedAt,
    })
    .from(workspaceAreaDocuments)
    .innerJoin(documents, eq(workspaceAreaDocuments.documentId, documents.id))
    .innerJoin(workspaceSources, eq(documents.sourceId, workspaceSources.id))
    .where(
      and(
        eq(workspaceAreaDocuments.vaultId, input.vaultId),
        eq(workspaceAreaDocuments.workspaceAreaId, input.workspaceAreaId),
      ),
    )
    .orderBy(desc(documents.updatedAt));

  if (documentRows.length === 0) {
    return [];
  }

  const documentIds = documentRows.map((documentRow) => documentRow.id);
  const chunkCountRows = await db
    .select({
      documentId: documentChunks.documentId,
      value: count(documentChunks.id),
    })
    .from(documentChunks)
    .where(inArray(documentChunks.documentId, documentIds))
    .groupBy(documentChunks.documentId);
  const chunkCountByDocumentId = new Map(chunkCountRows.map((row) => [row.documentId, row.value]));

  return documentRows.map((documentRow) => ({
    ...documentRow,
    chunkCount: chunkCountByDocumentId.get(documentRow.id) ?? 0,
  }));
}
