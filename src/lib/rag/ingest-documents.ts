import { and, eq, notInArray } from 'drizzle-orm';

import { getDb } from '@/db';
import { documentChunks, documents } from '@/db/schema';
import { mapWithConcurrency } from '@/lib/async';
import { createEmbedding } from '@/lib/rag/create-embedding';
import { chunkMarkdown } from '@/lib/rag/chunk-markdown';

import type { Db } from '@/db';
import type { Document, JsonValue, WorkspaceSourceType } from '@/db/schema';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { DocumentChunkInput } from '@/lib/rag/types';
import type { SourceDocument } from '@/lib/sources/types';

export type IngestDocumentsInput = {
  db?: Db;
  deleteMissingDocuments?: boolean;
  documents: SourceDocument[];
  embeddingConcurrency?: number;
  embeddingProvider?: EmbeddingProvider;
  onHeartbeat?: () => Promise<void> | void;
  workspaceIndexId: string;
  onProgress?: (progress: IngestDocumentsProgress) => Promise<void> | void;
  sourceId: string;
  sourceType: WorkspaceSourceType;
};

export type IngestDocumentsSummary = {
  chunksCreated: number;
  documentsCreated: number;
  documentsDeleted: number;
  documentsFound: number;
  documentsUpdated: number;
  skippedUnchanged: number;
};

export type IngestDocumentsProgress = IngestDocumentsSummary & {
  processedDocuments: number;
};

export type EmbeddedDocumentChunk = DocumentChunkInput & {
  embedding: number[];
};

export type ExistingDocumentFingerprint = {
  contentHash: string;
  externalId: string;
};

export type RagIngestionErrorCode = 'duplicate-source-document' | 'ingestion-failed';

export class RagIngestionError extends Error {
  code: RagIngestionErrorCode;

  constructor(code: RagIngestionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const defaultEmbeddingConcurrency = 3;

function normalizeEmbeddingConcurrency(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultEmbeddingConcurrency;
  }

  return Math.max(1, Math.floor(value));
}

function assertUniqueSourceDocuments(sourceDocuments: SourceDocument[]) {
  const seenExternalIds = new Set<string>();

  for (const sourceDocument of sourceDocuments) {
    if (seenExternalIds.has(sourceDocument.externalId)) {
      throw new RagIngestionError(
        'duplicate-source-document',
        `Duplicate source document externalId: ${sourceDocument.externalId}`,
      );
    }

    seenExternalIds.add(sourceDocument.externalId);
  }
}

function isJsonObject(value: object): value is Record<string, unknown> {
  return !Array.isArray(value);
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const jsonValues = value.flatMap((item) => {
      const jsonValue = toJsonValue(item);

      return jsonValue === undefined ? [] : [jsonValue];
    });

    return jsonValues;
  }

  if (typeof value === 'object' && value && isJsonObject(value)) {
    const jsonObject: Record<string, JsonValue> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const jsonValue = toJsonValue(nestedValue);

      if (jsonValue !== undefined) {
        jsonObject[key] = jsonValue;
      }
    }

    return jsonObject;
  }

  return undefined;
}

function toNullableJsonValue(value: unknown): JsonValue | null {
  return toJsonValue(value) ?? null;
}

export function isUnchangedSourceDocument(
  existingDocument: ExistingDocumentFingerprint,
  sourceDocument: SourceDocument,
): boolean {
  return (
    existingDocument.externalId === sourceDocument.externalId &&
    existingDocument.contentHash === sourceDocument.contentHash
  );
}

async function createEmbeddedChunks(
  chunks: DocumentChunkInput[],
  embeddingConcurrency: number,
  onHeartbeat?: () => Promise<void> | void,
  embeddingProvider?: EmbeddingProvider,
): Promise<EmbeddedDocumentChunk[]> {
  return mapWithConcurrency({
    concurrency: embeddingConcurrency,
    items: chunks,
    mapper: async (chunk) => {
      const embedding = await createEmbedding(chunk.content, embeddingProvider);

      await onHeartbeat?.();

      return {
        ...chunk,
        embedding,
      };
    },
  });
}

async function upsertDocumentAndReplaceChunks(input: {
  db: Db;
  embeddedChunks: EmbeddedDocumentChunk[];
  existingDocument: Document | undefined;
  workspaceIndexId: string;
  sourceDocument: SourceDocument;
  sourceId: string;
  sourceType: WorkspaceSourceType;
}) {
  await input.db.transaction(async (tx) => {
    const now = new Date();
    const sourceMetadata = toNullableJsonValue(input.sourceDocument.metadata);
    const [documentRow] = input.existingDocument
      ? await tx
          .update(documents)
          .set({
            content: input.sourceDocument.content,
            contentHash: input.sourceDocument.contentHash,
            path: input.sourceDocument.path,
            sourceMetadata,
            title: input.sourceDocument.title,
            updatedAt: now,
          })
          .where(eq(documents.id, input.existingDocument.id))
          .returning()
      : await tx
          .insert(documents)
          .values({
            content: input.sourceDocument.content,
            contentHash: input.sourceDocument.contentHash,
            externalId: input.sourceDocument.externalId,
            path: input.sourceDocument.path,
            sourceId: input.sourceId,
            sourceMetadata,
            sourceType: input.sourceType,
            title: input.sourceDocument.title,
            workspaceIndexId: input.workspaceIndexId,
          })
          .returning();

    if (!documentRow) {
      throw new RagIngestionError('ingestion-failed', 'Document upsert failed.');
    }

    await tx.delete(documentChunks).where(eq(documentChunks.documentId, documentRow.id));

    if (input.embeddedChunks.length === 0) {
      return;
    }

    await tx.insert(documentChunks).values(
      input.embeddedChunks.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        documentId: documentRow.id,
        embedding: chunk.embedding,
        metadata: toNullableJsonValue(chunk.metadata),
        sourceId: input.sourceId,
        tokenEstimate: chunk.tokenEstimate,
        workspaceIndexId: input.workspaceIndexId,
      })),
    );
  });
}

async function deleteRemovedDocuments(input: {
  db: Db;
  workspaceIndexId: string;
  sourceId: string;
  syncedExternalIds: string[];
}): Promise<number> {
  const baseWhere = and(
    eq(documents.workspaceIndexId, input.workspaceIndexId),
    eq(documents.sourceId, input.sourceId),
  );
  const where =
    input.syncedExternalIds.length > 0
      ? and(baseWhere, notInArray(documents.externalId, input.syncedExternalIds))
      : baseWhere;
  const deletedDocuments = await input.db
    .delete(documents)
    .where(where)
    .returning({ id: documents.id });

  return deletedDocuments.length;
}

export async function ingestDocuments({
  db = getDb(),
  deleteMissingDocuments: shouldDeleteMissingDocuments = true,
  documents: sourceDocuments,
  embeddingConcurrency,
  embeddingProvider,
  onHeartbeat,
  onProgress,
  sourceId,
  sourceType,
  workspaceIndexId,
}: IngestDocumentsInput): Promise<IngestDocumentsSummary> {
  assertUniqueSourceDocuments(sourceDocuments);

  const summary: IngestDocumentsSummary = {
    chunksCreated: 0,
    documentsCreated: 0,
    documentsDeleted: 0,
    documentsFound: sourceDocuments.length,
    documentsUpdated: 0,
    skippedUnchanged: 0,
  };
  const existingDocuments = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceIndexId, workspaceIndexId), eq(documents.sourceId, sourceId)));
  const existingDocumentByExternalId = new Map(
    existingDocuments.map((document) => [document.externalId, document]),
  );
  let processedDocuments = 0;
  const normalizedEmbeddingConcurrency = normalizeEmbeddingConcurrency(embeddingConcurrency);

  async function reportProgress() {
    if (!onProgress) {
      return;
    }

    await onProgress({
      ...summary,
      processedDocuments,
    });
  }

  await onHeartbeat?.();
  await reportProgress();

  for (const sourceDocument of sourceDocuments) {
    const existingDocument = existingDocumentByExternalId.get(sourceDocument.externalId);

    if (existingDocument && isUnchangedSourceDocument(existingDocument, sourceDocument)) {
      summary.skippedUnchanged += 1;
      processedDocuments += 1;
      await reportProgress();
      continue;
    }

    const chunks = chunkMarkdown(sourceDocument.content);
    const embeddedChunks = await createEmbeddedChunks(
      chunks,
      normalizedEmbeddingConcurrency,
      onHeartbeat,
      embeddingProvider,
    );
    await upsertDocumentAndReplaceChunks({
      db,
      embeddedChunks,
      existingDocument,
      sourceDocument,
      sourceId,
      sourceType,
      workspaceIndexId,
    });

    summary.chunksCreated += embeddedChunks.length;

    if (existingDocument) {
      summary.documentsUpdated += 1;
    } else {
      summary.documentsCreated += 1;
    }

    processedDocuments += 1;
    await reportProgress();
  }

  await onHeartbeat?.();

  if (shouldDeleteMissingDocuments) {
    summary.documentsDeleted = await deleteRemovedDocuments({
      db,
      sourceId,
      syncedExternalIds: sourceDocuments.map((sourceDocument) => sourceDocument.externalId),
      workspaceIndexId,
    });
  }

  await reportProgress();

  return summary;
}
