import { and, eq, inArray, isNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { getPrimaryWorkspaceIndex } from '@/db/queries/workspace-areas';
import {
  documents,
  workspaceAreaDocuments,
  workspaceAreas,
  workspaceDocs,
  workspaceIndexes,
  workspaceSources,
} from '@/db/schema';
import { ingestDocuments } from '@/lib/rag/ingest-documents';
import { hashContent } from '@/lib/sources/hash-content';

import type { Db } from '@/db';
import type { IngestDocumentsSummary } from '@/lib/rag/ingest-documents';
import type {
  WorkspaceDoc,
  WorkspaceDocSourceConfig,
  WorkspaceDocStatus,
  WorkspaceDocType,
} from '@/db/schema';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { SourceDocument } from '@/lib/sources/types';

export type IndexWorkspaceDocForAskAiInput = {
  db?: Db;
  docId: string;
  embeddingProvider?: EmbeddingProvider;
  vaultId: string;
};

export type IndexWorkspaceDocForAskAiResult = {
  documentId: string;
  sourceId: string;
  summary: IngestDocumentsSummary;
  workspaceIndexId: string;
};

export type SetWorkspaceDocAskAiIncludedInput = IndexWorkspaceDocForAskAiInput & {
  includeInAskAi: boolean;
};

export type SetWorkspaceDocAskAiIncludedResult = {
  deletedDocuments: number;
  doc: WorkspaceDoc;
  documentId: string | null;
  sourceId: string | null;
  summary: IngestDocumentsSummary | null;
  workspaceIndexId: string | null;
};

export type WorkspaceDocAskAiIndexingErrorCode = 'ingestion-failed' | 'source-not-configured';

export class WorkspaceDocAskAiIndexingError extends Error {
  code: WorkspaceDocAskAiIndexingErrorCode;

  constructor(code: WorkspaceDocAskAiIndexingErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type WorkspaceDocIndexTarget = {
  areaName: string;
  areaSlug: string;
  content: string;
  docType: WorkspaceDocType;
  id: string;
  vaultId: string;
  publishedAt: Date | null;
  status: WorkspaceDocStatus;
  title: string;
  updatedAt: Date;
  workspaceAreaId: string;
};

type IndexedWorkspaceDocDocument = {
  id: string;
  workspaceIndexId: string;
};

const workspaceDocSourceName = 'VaultMind docs';

function getWorkspaceDocExternalId(docId: string): string {
  return `workspace-doc:${docId}`;
}

function slugifyPathSegment(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);

  return slug.length > 0 ? slug : 'workspace-doc';
}

function createWorkspaceDocSourceDocument(doc: WorkspaceDocIndexTarget): SourceDocument {
  const path = [
    'vaultmind',
    'docs',
    doc.areaSlug,
    `${slugifyPathSegment(doc.title)}-${doc.id}.md`,
  ].join('/');

  return {
    content: doc.content,
    contentHash: hashContent(doc.content),
    externalId: getWorkspaceDocExternalId(doc.id),
    metadata: {
      docType: doc.docType,
      generatedBy: 'vaultmind-docs',
      publishedAt: doc.publishedAt?.toISOString() ?? null,
      sourceType: 'workspace-doc',
      status: doc.status,
      updatedAt: doc.updatedAt.toISOString(),
      workspaceAreaId: doc.workspaceAreaId,
      workspaceAreaName: doc.areaName,
      workspaceAreaSlug: doc.areaSlug,
      workspaceDocId: doc.id,
    },
    path,
    title: doc.title,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function getWorkspaceDocIndexTarget({
  db,
  docId,
  vaultId,
}: {
  db: Db;
  docId: string;
  vaultId: string;
}): Promise<WorkspaceDocIndexTarget | null> {
  const [doc] = await db
    .select({
      areaName: workspaceAreas.name,
      areaSlug: workspaceAreas.slug,
      content: workspaceDocs.content,
      docType: workspaceDocs.docType,
      id: workspaceDocs.id,
      publishedAt: workspaceDocs.publishedAt,
      status: workspaceDocs.status,
      title: workspaceDocs.title,
      updatedAt: workspaceDocs.updatedAt,
      vaultId: workspaceDocs.vaultId,
      workspaceAreaId: workspaceDocs.workspaceAreaId,
    })
    .from(workspaceDocs)
    .innerJoin(workspaceAreas, eq(workspaceDocs.workspaceAreaId, workspaceAreas.id))
    .where(
      and(
        eq(workspaceDocs.id, docId),
        eq(workspaceDocs.vaultId, vaultId),
        eq(workspaceAreas.vaultId, vaultId),
        isNull(workspaceDocs.archivedAt),
      ),
    )
    .limit(1);

  return doc ?? null;
}

async function getOrCreateWorkspaceDocSource({
  db,
  workspaceIndexId,
}: {
  db: Db;
  workspaceIndexId: string;
}): Promise<{ id: string }> {
  const [existingSource] = await db
    .select({ id: workspaceSources.id })
    .from(workspaceSources)
    .where(
      and(
        eq(workspaceSources.workspaceIndexId, workspaceIndexId),
        eq(workspaceSources.type, 'workspace-doc'),
      ),
    )
    .limit(1);

  if (existingSource) {
    return existingSource;
  }

  const config: WorkspaceDocSourceConfig = {
    generatedBy: 'vaultmind-docs',
    readonly: true,
  };
  const [createdSource] = await db
    .insert(workspaceSources)
    .values({
      config,
      name: workspaceDocSourceName,
      type: 'workspace-doc',
      workspaceIndexId,
    })
    .returning({ id: workspaceSources.id });

  if (!createdSource) {
    throw new WorkspaceDocAskAiIndexingError(
      'ingestion-failed',
      'Could not create the workspace doc source.',
    );
  }

  return createdSource;
}

async function listIndexedWorkspaceDocDocuments({
  db,
  docId,
  vaultId,
}: {
  db: Db;
  docId: string;
  vaultId: string;
}): Promise<IndexedWorkspaceDocDocument[]> {
  return db
    .select({
      id: documents.id,
      workspaceIndexId: documents.workspaceIndexId,
    })
    .from(documents)
    .innerJoin(workspaceIndexes, eq(documents.workspaceIndexId, workspaceIndexes.id))
    .where(
      and(
        eq(documents.externalId, getWorkspaceDocExternalId(docId)),
        eq(documents.sourceType, 'workspace-doc'),
        eq(workspaceIndexes.vaultId, vaultId),
      ),
    );
}

async function deleteIndexedWorkspaceDocDocuments({
  db,
  docId,
  exceptDocumentId,
  vaultId,
}: {
  db: Db;
  docId: string;
  exceptDocumentId?: string;
  vaultId: string;
}): Promise<number> {
  const existingDocuments = await listIndexedWorkspaceDocDocuments({
    db,
    docId,
    vaultId,
  });
  const documentIds = existingDocuments
    .filter((document) => document.id !== exceptDocumentId)
    .map((document) => document.id);

  if (documentIds.length === 0) {
    return 0;
  }

  const deletedDocuments = await db
    .delete(documents)
    .where(inArray(documents.id, documentIds))
    .returning({ id: documents.id });

  return deletedDocuments.length;
}

async function linkDocumentToWorkspaceArea({
  db,
  documentId,
  vaultId,
  workspaceAreaId,
}: {
  db: Db;
  documentId: string;
  vaultId: string;
  workspaceAreaId: string;
}) {
  await db.delete(workspaceAreaDocuments).where(eq(workspaceAreaDocuments.documentId, documentId));

  await db
    .insert(workspaceAreaDocuments)
    .values({
      confidence: 1,
      documentId,
      reason: 'Internal VaultMind doc included in Ask AI.',
      vaultId,
      workspaceAreaId,
    })
    .onConflictDoUpdate({
      set: {
        confidence: 1,
        reason: 'Internal VaultMind doc included in Ask AI.',
      },
      target: [workspaceAreaDocuments.workspaceAreaId, workspaceAreaDocuments.documentId],
    });
}

export async function indexWorkspaceDocForAskAi({
  db = getDb(),
  docId,
  embeddingProvider,
  vaultId,
}: IndexWorkspaceDocForAskAiInput): Promise<IndexWorkspaceDocForAskAiResult | null> {
  const doc = await getWorkspaceDocIndexTarget({ db, docId, vaultId });

  if (!doc) {
    return null;
  }

  const workspaceIndex = await getPrimaryWorkspaceIndex({ db, vaultId });

  if (!workspaceIndex) {
    throw new WorkspaceDocAskAiIndexingError(
      'source-not-configured',
      'Create a knowledge base before including internal docs in Ask AI.',
    );
  }

  const source = await getOrCreateWorkspaceDocSource({
    db,
    workspaceIndexId: workspaceIndex.id,
  });
  const sourceDocument = createWorkspaceDocSourceDocument(doc);
  const summary = await ingestDocuments({
    db,
    deleteMissingDocuments: false,
    documents: [sourceDocument],
    ...(embeddingProvider ? { embeddingProvider } : {}),
    sourceId: source.id,
    sourceType: 'workspace-doc',
    workspaceIndexId: workspaceIndex.id,
  });
  const [indexedDocument] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceIndexId, workspaceIndex.id),
        eq(documents.sourceId, source.id),
        eq(documents.externalId, sourceDocument.externalId),
      ),
    )
    .limit(1);

  if (!indexedDocument) {
    throw new WorkspaceDocAskAiIndexingError('ingestion-failed', 'Workspace doc was not indexed.');
  }

  await linkDocumentToWorkspaceArea({
    db,
    documentId: indexedDocument.id,
    vaultId,
    workspaceAreaId: doc.workspaceAreaId,
  });
  await deleteIndexedWorkspaceDocDocuments({
    db,
    docId,
    exceptDocumentId: indexedDocument.id,
    vaultId,
  });

  return {
    documentId: indexedDocument.id,
    sourceId: source.id,
    summary,
    workspaceIndexId: workspaceIndex.id,
  };
}

export async function setWorkspaceDocAskAiIncluded({
  db = getDb(),
  docId,
  embeddingProvider,
  includeInAskAi,
  vaultId,
}: SetWorkspaceDocAskAiIncludedInput): Promise<SetWorkspaceDocAskAiIncludedResult | null> {
  if (includeInAskAi) {
    const indexResult = await indexWorkspaceDocForAskAi({
      db,
      docId,
      ...(embeddingProvider ? { embeddingProvider } : {}),
      vaultId,
    });

    if (!indexResult) {
      return null;
    }

    const [doc] = await db
      .update(workspaceDocs)
      .set({
        includeInAskAi: true,
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

    if (!doc) {
      return null;
    }

    return {
      deletedDocuments: 0,
      doc,
      documentId: indexResult.documentId,
      sourceId: indexResult.sourceId,
      summary: indexResult.summary,
      workspaceIndexId: indexResult.workspaceIndexId,
    };
  }

  const deletedDocuments = await deleteIndexedWorkspaceDocDocuments({
    db,
    docId,
    vaultId,
  });
  const [doc] = await db
    .update(workspaceDocs)
    .set({
      includeInAskAi: false,
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

  if (!doc) {
    return null;
  }

  return {
    deletedDocuments,
    doc,
    documentId: null,
    sourceId: null,
    summary: null,
    workspaceIndexId: null,
  };
}
