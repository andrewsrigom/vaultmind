import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { getDb } from '@/db';
import { promoteAreaSuggestionToWorkspaceArea } from '@/db/queries/workspace-areas';
import {
  areaDiscoveryRuns,
  areaSuggestionDocuments,
  areaSuggestions,
  documents,
  workspaceIndexes,
} from '@/db/schema';

import type { Db } from '@/db';
import type {
  AreaDiscoveryRun,
  AreaDiscoveryRunStatus,
  AreaSuggestion,
  AreaSuggestionDocument,
  AreaSuggestionStatus,
  WorkspaceSourceType,
} from '@/db/schema';

export type AreaDiscoveryDocument = {
  content: string;
  contentHash: string;
  id: string;
  path: string;
  sourceId: string;
  sourceType: WorkspaceSourceType;
  title: string;
};

export type AreaDiscoveryRunListItem = {
  completedAt: Date | null;
  createdAt: Date;
  documentCount: number;
  errorCode: string | null;
  id: string;
  status: AreaDiscoveryRunStatus;
  suggestionCount: number;
  summary: string | null;
  updatedAt: Date;
};

export type AreaSuggestionDocumentDetail = AreaSuggestionDocument & {
  document: {
    id: string;
    path: string;
    sourceType: WorkspaceSourceType;
    title: string;
  };
};

export type AreaSuggestionWithDocuments = {
  documents: AreaSuggestionDocumentDetail[];
  suggestion: AreaSuggestion;
};

export type AreaDiscoveryRunDetail = {
  run: AreaDiscoveryRun;
  suggestions: AreaSuggestionWithDocuments[];
};

export type CreateAreaSuggestionInput = {
  confidence: number;
  db?: Db;
  description: string;
  documents: Array<{
    confidence: number;
    documentId: string;
    reason: string;
  }>;
  workspaceIndexId: string;
  name: string;
  reason: string;
  runId: string;
  sortOrder: number;
};

function requireRow<TValue>(row: TValue | undefined, message: string): TValue {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function workspaceIndexExists(db: Db, workspaceIndexId: string): Promise<boolean> {
  const [workspaceIndex] = await db
    .select({ id: workspaceIndexes.id })
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, workspaceIndexId))
    .limit(1);

  return Boolean(workspaceIndex);
}

export async function listAreaDiscoveryRuns({
  db = getDb(),
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
}): Promise<AreaDiscoveryRunListItem[]> {
  const runs = await db
    .select()
    .from(areaDiscoveryRuns)
    .where(eq(areaDiscoveryRuns.workspaceIndexId, workspaceIndexId))
    .orderBy(desc(areaDiscoveryRuns.createdAt));

  if (runs.length === 0) {
    return [];
  }

  const runIds = runs.map((run) => run.id);
  const suggestionCountRows = await db
    .select({
      runId: areaSuggestions.runId,
      value: count(areaSuggestions.id),
    })
    .from(areaSuggestions)
    .where(inArray(areaSuggestions.runId, runIds))
    .groupBy(areaSuggestions.runId);
  const documentCountRows = await db
    .select({
      runId: areaSuggestionDocuments.runId,
      value: count(areaSuggestionDocuments.id),
    })
    .from(areaSuggestionDocuments)
    .where(inArray(areaSuggestionDocuments.runId, runIds))
    .groupBy(areaSuggestionDocuments.runId);
  const suggestionCountByRunId = new Map(suggestionCountRows.map((row) => [row.runId, row.value]));
  const documentCountByRunId = new Map(documentCountRows.map((row) => [row.runId, row.value]));

  return runs.map((run) => ({
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    documentCount: documentCountByRunId.get(run.id) ?? 0,
    errorCode: run.errorCode,
    id: run.id,
    status: run.status,
    suggestionCount: suggestionCountByRunId.get(run.id) ?? 0,
    summary: run.summary,
    updatedAt: run.updatedAt,
  }));
}

export async function createAreaDiscoveryRun({
  db = getDb(),
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
}): Promise<AreaDiscoveryRun | null> {
  if (!(await workspaceIndexExists(db, workspaceIndexId))) {
    return null;
  }

  const [run] = await db.insert(areaDiscoveryRuns).values({ workspaceIndexId }).returning();

  return requireRow(run, 'Failed to create area discovery run.');
}

export async function startAreaDiscoveryRun({
  db = getDb(),
  runId,
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
  runId: string;
}): Promise<AreaDiscoveryRun | null> {
  const [run] = await db
    .select()
    .from(areaDiscoveryRuns)
    .where(
      and(
        eq(areaDiscoveryRuns.id, runId),
        eq(areaDiscoveryRuns.workspaceIndexId, workspaceIndexId),
      ),
    )
    .limit(1);

  if (!run) {
    return null;
  }

  const [updatedRun] = await db
    .update(areaDiscoveryRuns)
    .set({
      completedAt: null,
      error: null,
      errorCode: null,
      startedAt: new Date(),
      status: 'running',
      summary: null,
      updatedAt: new Date(),
    })
    .where(eq(areaDiscoveryRuns.id, run.id))
    .returning();

  return requireRow(updatedRun, 'Failed to start area discovery run.');
}

export async function failAreaDiscoveryRun({
  db = getDb(),
  error,
  errorCode,
  runId,
  workspaceIndexId,
}: {
  db?: Db;
  error: string;
  errorCode: string;
  workspaceIndexId: string;
  runId: string;
}): Promise<void> {
  await db
    .update(areaDiscoveryRuns)
    .set({
      completedAt: new Date(),
      error,
      errorCode,
      status: 'failed',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(areaDiscoveryRuns.id, runId),
        eq(areaDiscoveryRuns.workspaceIndexId, workspaceIndexId),
      ),
    );
}

export async function completeAreaDiscoveryRun({
  db = getDb(),
  model,
  runId,
  summary,
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
  model: string;
  runId: string;
  summary: string;
}): Promise<AreaDiscoveryRun | null> {
  const [run] = await db
    .update(areaDiscoveryRuns)
    .set({
      completedAt: new Date(),
      model,
      status: 'completed',
      summary,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(areaDiscoveryRuns.id, runId),
        eq(areaDiscoveryRuns.workspaceIndexId, workspaceIndexId),
      ),
    )
    .returning();

  return run ?? null;
}

export async function deleteAreaDiscoveryRunResults({
  db = getDb(),
  runId,
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
  runId: string;
}): Promise<void> {
  await db
    .delete(areaSuggestions)
    .where(
      and(eq(areaSuggestions.runId, runId), eq(areaSuggestions.workspaceIndexId, workspaceIndexId)),
    );
}

export async function listAreaDiscoveryDocuments({
  db = getDb(),
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
}): Promise<AreaDiscoveryDocument[]> {
  return db
    .select({
      content: documents.content,
      contentHash: documents.contentHash,
      id: documents.id,
      path: documents.path,
      sourceId: documents.sourceId,
      sourceType: documents.sourceType,
      title: documents.title,
    })
    .from(documents)
    .where(eq(documents.workspaceIndexId, workspaceIndexId))
    .orderBy(documents.path);
}

export async function createAreaSuggestion({
  confidence,
  db = getDb(),
  description,
  documents: suggestionDocuments,
  name,
  reason,
  runId,
  sortOrder,
  workspaceIndexId,
}: CreateAreaSuggestionInput): Promise<AreaSuggestion | null> {
  return db.transaction(async (tx) => {
    const [suggestion] = await tx
      .insert(areaSuggestions)
      .values({
        confidence,
        description,
        name,
        reason,
        runId,
        sortOrder,
        workspaceIndexId,
      })
      .returning();
    const createdSuggestion = requireRow(suggestion, 'Failed to create area suggestion.');

    if (suggestionDocuments.length > 0) {
      await tx.insert(areaSuggestionDocuments).values(
        suggestionDocuments.map((document) => ({
          confidence: document.confidence,
          documentId: document.documentId,
          reason: document.reason,
          runId,
          suggestionId: createdSuggestion.id,
          workspaceIndexId,
        })),
      );
    }

    return createdSuggestion;
  });
}

export async function getAreaDiscoveryRunDetail({
  db = getDb(),
  runId,
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
  runId: string;
}): Promise<AreaDiscoveryRunDetail | null> {
  const [run] = await db
    .select()
    .from(areaDiscoveryRuns)
    .where(
      and(
        eq(areaDiscoveryRuns.id, runId),
        eq(areaDiscoveryRuns.workspaceIndexId, workspaceIndexId),
      ),
    )
    .limit(1);

  if (!run) {
    return null;
  }

  const suggestions = await db
    .select()
    .from(areaSuggestions)
    .where(
      and(eq(areaSuggestions.runId, runId), eq(areaSuggestions.workspaceIndexId, workspaceIndexId)),
    )
    .orderBy(areaSuggestions.sortOrder);

  if (suggestions.length === 0) {
    return {
      run,
      suggestions: [],
    };
  }

  const suggestionIds = suggestions.map((suggestion) => suggestion.id);
  const documentRows = await db
    .select({
      confidence: areaSuggestionDocuments.confidence,
      createdAt: areaSuggestionDocuments.createdAt,
      document: {
        id: documents.id,
        path: documents.path,
        sourceType: documents.sourceType,
        title: documents.title,
      },
      documentId: areaSuggestionDocuments.documentId,
      id: areaSuggestionDocuments.id,
      reason: areaSuggestionDocuments.reason,
      runId: areaSuggestionDocuments.runId,
      suggestionId: areaSuggestionDocuments.suggestionId,
      workspaceIndexId: areaSuggestionDocuments.workspaceIndexId,
    })
    .from(areaSuggestionDocuments)
    .innerJoin(documents, eq(areaSuggestionDocuments.documentId, documents.id))
    .where(
      and(
        eq(areaSuggestionDocuments.workspaceIndexId, workspaceIndexId),
        inArray(areaSuggestionDocuments.suggestionId, suggestionIds),
      ),
    );
  const documentsBySuggestionId = new Map<string, AreaSuggestionDocumentDetail[]>();

  for (const documentRow of documentRows) {
    const currentDocuments = documentsBySuggestionId.get(documentRow.suggestionId) ?? [];
    currentDocuments.push(documentRow);
    documentsBySuggestionId.set(documentRow.suggestionId, currentDocuments);
  }

  return {
    run,
    suggestions: suggestions.map((suggestion) => ({
      documents: documentsBySuggestionId.get(suggestion.id) ?? [],
      suggestion,
    })),
  };
}

export async function updateAreaSuggestionStatus({
  db = getDb(),
  status,
  suggestionId,
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
  status: AreaSuggestionStatus;
  suggestionId: string;
}): Promise<AreaSuggestion | null> {
  const [suggestion] = await db
    .update(areaSuggestions)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(areaSuggestions.id, suggestionId),
        eq(areaSuggestions.workspaceIndexId, workspaceIndexId),
      ),
    )
    .returning();

  if (!suggestion) {
    return null;
  }

  if (status === 'accepted') {
    await promoteAreaSuggestionToWorkspaceArea({
      db,
      suggestionId,
      workspaceIndexId,
    });
  }

  return suggestion;
}

export async function updatePendingAreaDiscoveryRunSuggestionsStatus({
  db = getDb(),
  runId,
  status,
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
  runId: string;
  status: AreaSuggestionStatus;
}): Promise<AreaSuggestion[]> {
  const suggestions = await db
    .update(areaSuggestions)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(areaSuggestions.runId, runId),
        eq(areaSuggestions.workspaceIndexId, workspaceIndexId),
        eq(areaSuggestions.status, 'suggested'),
      ),
    )
    .returning();

  if (status === 'accepted') {
    for (const suggestion of suggestions) {
      await promoteAreaSuggestionToWorkspaceArea({
        db,
        suggestionId: suggestion.id,
        workspaceIndexId,
      });
    }
  }

  return suggestions;
}
