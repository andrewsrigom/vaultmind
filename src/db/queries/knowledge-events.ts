import { and, count, eq, gte, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  chatMessages,
  chatSessions,
  knowledgeEvents,
  workspaceAreas,
  workspaceIndexes,
} from '@/db/schema';

import type { Db } from '@/db';
import type { JsonValue, KnowledgeEvent, KnowledgeEventType, TrustSignalType } from '@/db/schema';

export type WorkspaceIndexKpiSummary = {
  answerGeneratedCount: number;
  answerRefusedCount: number;
  answerSuccessRate: number | null;
  conflictingSignalCount: number;
  helpfulRate: number | null;
  helpfulSignalCount: number;
  issueSignalCount: number;
  missingSourceSignalCount: number;
  notHelpfulSignalCount: number;
  outdatedSignalCount: number;
  questionCount: number;
  sourceCitationCount: number;
  sourceSyncFailureCount: number;
  sourceSyncSuccessCount: number;
  trustSignalCount: number;
  wrongScopeSignalCount: number;
};

export type CreateKnowledgeEventInput = {
  chatMessageId?: string | null;
  chatSessionId?: string | null;
  db?: Db;
  workspaceIndexId: string;
  metadata?: JsonValue | null;
  vaultId: string;
  sourceId?: string | null;
  type: KnowledgeEventType;
};

export type CreateWorkspaceIndexEventInput = Omit<CreateKnowledgeEventInput, 'vaultId'>;

export type CreateTrustSignalEventInput = {
  chatMessageId: string;
  db?: Db;
  signal: TrustSignalType;
  workspaceAreaId?: string | null;
  workspaceIndexId: string;
};

export type TrustSignalEventResult =
  | {
      event: KnowledgeEvent;
      status: 'created';
    }
  | {
      reason: 'area-not-found' | 'message-not-assistant' | 'message-not-found';
      status: 'not-created';
    };

export type CountRecentNegativeTrustSignalsInput = {
  db?: Db;
  since?: Date;
  workspaceAreaId?: string | null;
  workspaceIndexId: string;
};

const defaultRecentTrustSignalWindowMs = 30 * 24 * 60 * 60 * 1000;
const negativeTrustSignalFilter = sql`${knowledgeEvents.metadata}->>'signal' in (
  'not-helpful',
  'missing-source',
  'outdated',
  'conflicting',
  'wrong-scope'
)`;

function requireRow<TValue>(row: TValue | undefined, message: string): TValue {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

function getEventCount(
  countByType: Map<KnowledgeEventType, number>,
  type: KnowledgeEventType,
): number {
  return countByType.get(type) ?? 0;
}

function toRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

export async function getWorkspaceIndexKpiSummary({
  db = getDb(),
  workspaceIndexId,
}: {
  db?: Db;
  workspaceIndexId: string;
}): Promise<WorkspaceIndexKpiSummary> {
  const eventCountRows = await db
    .select({
      type: knowledgeEvents.type,
      value: count(knowledgeEvents.id),
    })
    .from(knowledgeEvents)
    .where(eq(knowledgeEvents.workspaceIndexId, workspaceIndexId))
    .groupBy(knowledgeEvents.type);
  const [trustSignalCounts] = await db
    .select({
      conflicting: sql<number>`count(*) filter (where ${knowledgeEvents.metadata}->>'signal' = 'conflicting')::int`,
      helpful: sql<number>`count(*) filter (where ${knowledgeEvents.metadata}->>'signal' = 'helpful')::int`,
      missingSource: sql<number>`count(*) filter (where ${knowledgeEvents.metadata}->>'signal' = 'missing-source')::int`,
      notHelpful: sql<number>`count(*) filter (where ${knowledgeEvents.metadata}->>'signal' = 'not-helpful')::int`,
      outdated: sql<number>`count(*) filter (where ${knowledgeEvents.metadata}->>'signal' = 'outdated')::int`,
      wrongScope: sql<number>`count(*) filter (where ${knowledgeEvents.metadata}->>'signal' = 'wrong-scope')::int`,
    })
    .from(knowledgeEvents)
    .where(
      and(
        eq(knowledgeEvents.workspaceIndexId, workspaceIndexId),
        eq(knowledgeEvents.type, 'trust-signal-submitted'),
      ),
    );
  const countByType = new Map<KnowledgeEventType, number>(
    eventCountRows.map((row) => [row.type, row.value]),
  );
  const questionCount = getEventCount(countByType, 'question-asked');
  const answerGeneratedCount = getEventCount(countByType, 'answer-generated');
  const answerRefusedCount = getEventCount(countByType, 'answer-refused');
  const sourceCitationCount = getEventCount(countByType, 'source-cited');
  const sourceSyncFailureCount = getEventCount(countByType, 'source-sync-failed');
  const sourceSyncSuccessCount = getEventCount(countByType, 'source-synced');
  const trustSignalCount = getEventCount(countByType, 'trust-signal-submitted');
  const conflictingSignalCount = trustSignalCounts?.conflicting ?? 0;
  const helpfulSignalCount = trustSignalCounts?.helpful ?? 0;
  const missingSourceSignalCount = trustSignalCounts?.missingSource ?? 0;
  const notHelpfulSignalCount = trustSignalCounts?.notHelpful ?? 0;
  const outdatedSignalCount = trustSignalCounts?.outdated ?? 0;
  const wrongScopeSignalCount = trustSignalCounts?.wrongScope ?? 0;
  const answerAttemptCount = answerGeneratedCount + answerRefusedCount;
  const ratedTrustSignalCount = helpfulSignalCount + notHelpfulSignalCount;
  const issueSignalCount =
    missingSourceSignalCount + outdatedSignalCount + conflictingSignalCount + wrongScopeSignalCount;

  return {
    answerGeneratedCount,
    answerRefusedCount,
    answerSuccessRate: toRate(answerGeneratedCount, answerAttemptCount),
    conflictingSignalCount,
    helpfulRate: toRate(helpfulSignalCount, ratedTrustSignalCount),
    helpfulSignalCount,
    issueSignalCount,
    missingSourceSignalCount,
    notHelpfulSignalCount,
    outdatedSignalCount,
    questionCount,
    sourceCitationCount,
    sourceSyncFailureCount,
    sourceSyncSuccessCount,
    trustSignalCount,
    wrongScopeSignalCount,
  };
}

export async function createKnowledgeEvent({
  chatMessageId = null,
  chatSessionId = null,
  db = getDb(),
  metadata = null,
  sourceId = null,
  type,
  vaultId,
  workspaceIndexId,
}: CreateKnowledgeEventInput): Promise<KnowledgeEvent> {
  const [event] = await db
    .insert(knowledgeEvents)
    .values({
      chatMessageId,
      chatSessionId,
      metadata,
      sourceId,
      type,
      vaultId,
      workspaceIndexId,
    })
    .returning();

  return requireRow(event, 'Failed to create knowledge event.');
}

export async function createWorkspaceIndexEvent({
  chatMessageId = null,
  chatSessionId = null,
  db = getDb(),
  metadata = null,
  sourceId = null,
  type,
  workspaceIndexId,
}: CreateWorkspaceIndexEventInput): Promise<KnowledgeEvent | null> {
  const [workspaceIndex] = await db
    .select({
      vaultId: workspaceIndexes.vaultId,
    })
    .from(workspaceIndexes)
    .where(eq(workspaceIndexes.id, workspaceIndexId))
    .limit(1);

  if (!workspaceIndex) {
    return null;
  }

  return createKnowledgeEvent({
    chatMessageId,
    chatSessionId,
    db,
    metadata,
    sourceId,
    type,
    vaultId: workspaceIndex.vaultId,
    workspaceIndexId,
  });
}

export async function createTrustSignalEvent({
  chatMessageId,
  db = getDb(),
  signal,
  workspaceAreaId = null,
  workspaceIndexId,
}: CreateTrustSignalEventInput): Promise<TrustSignalEventResult> {
  const [message] = await db
    .select({
      chatSessionId: chatMessages.chatSessionId,
      role: chatMessages.role,
      vaultId: workspaceIndexes.vaultId,
      workspaceIndexId: chatSessions.workspaceIndexId,
    })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.chatSessionId, chatSessions.id))
    .innerJoin(workspaceIndexes, eq(chatSessions.workspaceIndexId, workspaceIndexes.id))
    .where(
      and(eq(chatMessages.id, chatMessageId), eq(chatSessions.workspaceIndexId, workspaceIndexId)),
    )
    .limit(1);

  if (!message) {
    return {
      reason: 'message-not-found',
      status: 'not-created',
    };
  }

  if (message.role !== 'assistant') {
    return {
      reason: 'message-not-assistant',
      status: 'not-created',
    };
  }

  if (workspaceAreaId) {
    const [workspaceArea] = await db
      .select({
        id: workspaceAreas.id,
      })
      .from(workspaceAreas)
      .where(
        and(eq(workspaceAreas.id, workspaceAreaId), eq(workspaceAreas.vaultId, message.vaultId)),
      )
      .limit(1);

    if (!workspaceArea) {
      return {
        reason: 'area-not-found',
        status: 'not-created',
      };
    }
  }

  const event = await createKnowledgeEvent({
    chatMessageId,
    chatSessionId: message.chatSessionId,
    db,
    metadata: {
      signal,
      ...(workspaceAreaId ? { workspaceAreaId } : {}),
    },
    type: 'trust-signal-submitted',
    vaultId: message.vaultId,
    workspaceIndexId: message.workspaceIndexId,
  });

  return {
    event,
    status: 'created',
  };
}

export async function countRecentNegativeTrustSignals({
  db = getDb(),
  since = new Date(Date.now() - defaultRecentTrustSignalWindowMs),
  workspaceAreaId = null,
  workspaceIndexId,
}: CountRecentNegativeTrustSignalsInput): Promise<number> {
  const filters = [
    eq(knowledgeEvents.workspaceIndexId, workspaceIndexId),
    eq(knowledgeEvents.type, 'trust-signal-submitted'),
    gte(knowledgeEvents.createdAt, since),
    negativeTrustSignalFilter,
    ...(workspaceAreaId
      ? [sql`${knowledgeEvents.metadata}->>'workspaceAreaId' = ${workspaceAreaId}`]
      : []),
  ];
  const [result] = await db
    .select({
      value: count(knowledgeEvents.id),
    })
    .from(knowledgeEvents)
    .where(and(...filters));

  return result?.value ?? 0;
}
