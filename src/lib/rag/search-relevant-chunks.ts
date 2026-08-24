import { and, count, eq, gte, ilike, inArray, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  documentChunks,
  documents,
  workspaceIndexes,
  workspaceSources,
  workspaceAreaDocuments,
} from '@/db/schema';
import { createEmbedding } from '@/lib/rag/create-embedding';
import { isOverviewRetrievalQuery, rankRelevantChunksForQuery } from '@/lib/rag/retrieval-ranking';

import type { Db } from '@/db';
import type { JsonValue, WorkspaceSourceType } from '@/db/schema';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { SQL } from 'drizzle-orm';

export type SearchRelevantChunksInput = {
  db?: Db;
  embeddingProvider?: EmbeddingProvider;
  folder?: string;
  workspaceIndexId?: string;
  workspaceIndexIds?: string[];
  limit?: number;
  query: string;
  sourceId?: string;
  sourceIds?: string[];
  tags?: string[];
  updatedAfter?: Date;
  workspaceAreaId?: string;
  workspaceAreaIds?: string[];
};

export type RelevantChunk = {
  chunkId: string;
  chunkIndex: number;
  chunkMetadata: JsonValue | null;
  content: string;
  documentId: string;
  documentMetadata: JsonValue | null;
  workspaceIndexId?: string;
  workspaceIndexName?: string;
  path: string;
  similarity: number;
  sourceId: string;
  sourceName: string;
  sourceType: WorkspaceSourceType;
  title: string;
};

export class RagRetrievalError extends Error {
  code: 'no-relevant-chunks';

  constructor(message: string) {
    super(message);
    this.code = 'no-relevant-chunks';
  }
}

export const defaultRetrievalLimit = 4;
const maxRetrievalLimit = 20;
const candidateMultiplier = 8;
const maxCandidateLimit = 50;

function getSafeLimit(limit: number | undefined): number {
  if (!limit) {
    return defaultRetrievalLimit;
  }

  return Math.min(Math.max(limit, 1), maxRetrievalLimit);
}

function getCandidateLimit(limit: number): number {
  return Math.min(Math.max(limit * candidateMultiplier, limit), maxCandidateLimit);
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

function getScopedWorkspaceIndexIds({
  workspaceIndexId,
  workspaceIndexIds,
}: Pick<SearchRelevantChunksInput, 'workspaceIndexId' | 'workspaceIndexIds'>): string[] {
  const ids = workspaceIndexIds?.length
    ? workspaceIndexIds
    : workspaceIndexId
      ? [workspaceIndexId]
      : [];

  return [...new Set(ids)];
}

function getScopedIds(singleId: string | undefined, ids: string[] | undefined): string[] {
  const scopedIds = ids?.length ? ids : singleId ? [singleId] : [];

  return [...new Set(scopedIds)];
}

function getWorkspaceIndexFilter<TColumn>(column: TColumn, workspaceIndexIds: string[]): SQL {
  return workspaceIndexIds.length === 1
    ? eq(column as Parameters<typeof eq>[0], workspaceIndexIds[0])
    : inArray(column as Parameters<typeof inArray>[0], workspaceIndexIds);
}

function getIdFilter<TColumn>(column: TColumn, ids: string[]): SQL {
  return ids.length === 1
    ? eq(column as Parameters<typeof eq>[0], ids[0])
    : inArray(column as Parameters<typeof inArray>[0], ids);
}

function getOverviewPathFilter(): SQL {
  return sql`(
    lower(${documents.path}) in (
      'readme.md',
      'readme.mdx',
      'overview.md',
      'overview.mdx',
      'index.md',
      'index.mdx'
    )
    or lower(${documents.path}) like '%/readme.md'
    or lower(${documents.path}) like '%/readme.mdx'
    or lower(${documents.path}) like '%/overview.md'
    or lower(${documents.path}) like '%/overview.mdx'
    or lower(${documents.path}) like '%/index.md'
    or lower(${documents.path}) like '%/index.mdx'
  )`;
}

function mergeRowsByChunkId(rows: RelevantChunk[], extraRows: RelevantChunk[]): RelevantChunk[] {
  const rowsById = new Map<string, RelevantChunk>();

  for (const row of [...rows, ...extraRows]) {
    rowsById.set(row.chunkId, row);
  }

  return [...rowsById.values()];
}

function getTagFilters(tags: string[] | undefined): SQL[] {
  if (!tags || tags.length === 0) {
    return [];
  }

  return tags.map((tag) => {
    const tagFilter = JSON.stringify({
      tags: [tag],
    });

    return sql`${documentChunks.metadata} @> ${tagFilter}::jsonb`;
  });
}

export async function searchRelevantChunks({
  db = getDb(),
  embeddingProvider,
  folder,
  limit,
  query,
  sourceId,
  sourceIds,
  tags,
  updatedAfter,
  workspaceAreaId,
  workspaceAreaIds,
  workspaceIndexId,
  workspaceIndexIds,
}: SearchRelevantChunksInput): Promise<RelevantChunk[]> {
  const safeLimit = getSafeLimit(limit);
  const scopeInput: Pick<SearchRelevantChunksInput, 'workspaceIndexId' | 'workspaceIndexIds'> = {};

  if (workspaceIndexId !== undefined) {
    scopeInput.workspaceIndexId = workspaceIndexId;
  }

  if (workspaceIndexIds !== undefined) {
    scopeInput.workspaceIndexIds = workspaceIndexIds;
  }

  const scopedWorkspaceIndexIds = getScopedWorkspaceIndexIds(scopeInput);
  const scopedSourceIds = getScopedIds(sourceId, sourceIds);
  const scopedWorkspaceAreaIds = getScopedIds(workspaceAreaId, workspaceAreaIds);

  if (scopedWorkspaceIndexIds.length === 0) {
    throw new RagRetrievalError('No workspace scope was provided for retrieval.');
  }

  const areaDocumentFilter = scopedWorkspaceAreaIds.length
    ? sql`${documents.id} in (
        select ${workspaceAreaDocuments.documentId}
        from ${workspaceAreaDocuments}
        where ${getIdFilter(workspaceAreaDocuments.workspaceAreaId, scopedWorkspaceAreaIds)}
      )`
    : null;
  const chunkCountFilters: SQL[] = [
    getWorkspaceIndexFilter(documentChunks.workspaceIndexId, scopedWorkspaceIndexIds),
    ...(areaDocumentFilter ? [areaDocumentFilter] : []),
    ...(updatedAfter ? [gte(documents.updatedAt, updatedAfter)] : []),
  ];
  const [chunkCountRow] = await db
    .select({ value: count(documentChunks.id) })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(...chunkCountFilters));

  if ((chunkCountRow?.value ?? 0) === 0) {
    throw new RagRetrievalError(
      'No indexed chunks exist for this workspace. Sync documents before asking questions.',
    );
  }

  const queryEmbedding = await createEmbedding(query, embeddingProvider);
  const queryVector = toVectorLiteral(queryEmbedding);
  const similarityScore = sql<number>`1 - (${documentChunks.embedding} <=> ${queryVector}::vector)`;
  const cosineDistance = sql<number>`${documentChunks.embedding} <=> ${queryVector}::vector`;
  const selection = {
    chunkId: documentChunks.id,
    chunkIndex: documentChunks.chunkIndex,
    chunkMetadata: documentChunks.metadata,
    content: documentChunks.content,
    documentId: documents.id,
    documentMetadata: documents.sourceMetadata,
    path: documents.path,
    similarity: similarityScore,
    sourceId: documents.sourceId,
    sourceName: workspaceSources.name,
    sourceType: documents.sourceType,
    title: documents.title,
    workspaceIndexId: documents.workspaceIndexId,
    workspaceIndexName: workspaceIndexes.name,
  };
  const whereConditions: SQL[] = [
    getWorkspaceIndexFilter(documentChunks.workspaceIndexId, scopedWorkspaceIndexIds),
    getWorkspaceIndexFilter(documents.workspaceIndexId, scopedWorkspaceIndexIds),
    ...(areaDocumentFilter ? [areaDocumentFilter] : []),
    ...(scopedSourceIds.length
      ? [
          getIdFilter(documentChunks.sourceId, scopedSourceIds),
          getIdFilter(documents.sourceId, scopedSourceIds),
        ]
      : []),
    ...(folder ? [ilike(documents.path, `${folder.replace(/\/+$/u, '')}/%`)] : []),
    ...(updatedAfter ? [gte(documents.updatedAt, updatedAfter)] : []),
    ...getTagFilters(tags),
  ];
  const rows = await db
    .select(selection)
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .innerJoin(workspaceIndexes, eq(documents.workspaceIndexId, workspaceIndexes.id))
    .innerJoin(workspaceSources, eq(documents.sourceId, workspaceSources.id))
    .where(and(...whereConditions))
    .orderBy(cosineDistance)
    .limit(getCandidateLimit(safeLimit));
  const overviewRows = isOverviewRetrievalQuery(query)
    ? await db
        .select(selection)
        .from(documentChunks)
        .innerJoin(documents, eq(documentChunks.documentId, documents.id))
        .innerJoin(workspaceIndexes, eq(documents.workspaceIndexId, workspaceIndexes.id))
        .innerJoin(workspaceSources, eq(documents.sourceId, workspaceSources.id))
        .where(and(...whereConditions, getOverviewPathFilter()))
        .orderBy(cosineDistance)
        .limit(Math.min(safeLimit, 6))
    : [];

  return rankRelevantChunksForQuery(mergeRowsByChunkId(rows, overviewRows), query, safeLimit);
}
