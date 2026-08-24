import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { createChatMessage, getOrCreateChatSession } from '@/db/queries/chat';
import { upsertWorkspaceArea } from '@/db/queries/workspace-areas';
import { createWorkspaceIndexWithGitHubSource } from '@/db/queries/workspace-indexes';
import {
  countRecentNegativeTrustSignals,
  createWorkspaceIndexEvent,
  createTrustSignalEvent,
  getWorkspaceIndexKpiSummary,
} from '@/db/queries/knowledge-events';
import { workspaceAreas, workspaceIndexes } from '@/db/schema';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const parsedRepo = {
  owner: 'openai',
  repo: 'openai-cookbook',
  repoUrl: 'https://github.com/openai/openai-cookbook',
} as const;

describeWithDatabase('knowledge event queries', () => {
  let db: Db | null = null;
  let workspaceAreaIds: string[] = [];
  let workspaceIndexIds: string[] = [];

  beforeEach(() => {
    db = getDb();
    workspaceAreaIds = [];
    workspaceIndexIds = [];
  });

  afterEach(async () => {
    if (db) {
      for (const workspaceAreaId of workspaceAreaIds) {
        await db.delete(workspaceAreas).where(eq(workspaceAreas.id, workspaceAreaId));
      }

      for (const workspaceIndexId of workspaceIndexIds) {
        await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
      }
    }

    db = null;
    workspaceAreaIds = [];
    workspaceIndexIds = [];
  });

  it('creates a trust signal event for assistant messages', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary knowledge event test',
      excludePaths: [],
      includePaths: [],
      name: 'Knowledge Event Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'Event test',
      workspaceIndexId: created.workspaceIndex.id,
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Assistant answer.',
      db,
      role: 'assistant',
    });

    const result = await createTrustSignalEvent({
      chatMessageId: assistantMessage.id,
      db,
      signal: 'helpful',
      workspaceIndexId: created.workspaceIndex.id,
    });

    expect(result.status).toBe('created');

    if (result.status !== 'created') {
      throw new Error('Expected trust signal event to be created.');
    }

    expect(result.event).toMatchObject({
      chatMessageId: assistantMessage.id,
      chatSessionId: session.id,
      metadata: {
        signal: 'helpful',
      },
      type: 'trust-signal-submitted',
      vaultId: created.workspaceIndex.vaultId,
      workspaceIndexId: created.workspaceIndex.id,
    });
  });

  it('aggregates reliable KPI summaries for a workspace index', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary KPI event test',
      excludePaths: [],
      includePaths: [],
      name: 'Knowledge Event KPI Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);

    await createWorkspaceIndexEvent({
      db,
      metadata: { questionLength: 24 },
      type: 'question-asked',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createWorkspaceIndexEvent({
      db,
      metadata: { sourceCount: 2 },
      type: 'answer-generated',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createWorkspaceIndexEvent({
      db,
      metadata: { sourceCount: 0 },
      type: 'answer-refused',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createWorkspaceIndexEvent({
      db,
      sourceId: created.source.id,
      type: 'source-cited',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createWorkspaceIndexEvent({
      db,
      sourceId: created.source.id,
      type: 'source-synced',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createWorkspaceIndexEvent({
      db,
      metadata: { errorCode: 'github-no-markdown-files' },
      sourceId: created.source.id,
      type: 'source-sync-failed',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createWorkspaceIndexEvent({
      db,
      metadata: { signal: 'helpful' },
      type: 'trust-signal-submitted',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createWorkspaceIndexEvent({
      db,
      metadata: { signal: 'not-helpful' },
      type: 'trust-signal-submitted',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createWorkspaceIndexEvent({
      db,
      metadata: { signal: 'missing-source' },
      type: 'trust-signal-submitted',
      workspaceIndexId: created.workspaceIndex.id,
    });

    await expect(
      getWorkspaceIndexKpiSummary({
        db,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toMatchObject({
      answerGeneratedCount: 1,
      answerRefusedCount: 1,
      answerSuccessRate: 0.5,
      conflictingSignalCount: 0,
      helpfulRate: 0.5,
      helpfulSignalCount: 1,
      issueSignalCount: 1,
      missingSourceSignalCount: 1,
      notHelpfulSignalCount: 1,
      outdatedSignalCount: 0,
      questionCount: 1,
      sourceCitationCount: 1,
      sourceSyncFailureCount: 1,
      sourceSyncSuccessCount: 1,
      trustSignalCount: 3,
      wrongScopeSignalCount: 0,
    });
  });

  it('stores area context and counts recent negative trust signals', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary area signal test',
      excludePaths: [],
      includePaths: [],
      name: 'Area Signal Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);

    const area = await upsertWorkspaceArea({
      db,
      description: 'Area trust signal test.',
      name: 'Area Signal Test',
      slug: `area-signal-test-${created.workspaceIndex.id}`,
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(area.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'Area signal test',
      workspaceIndexId: created.workspaceIndex.id,
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Assistant answer.',
      db,
      role: 'assistant',
    });

    const areaSignal = await createTrustSignalEvent({
      chatMessageId: assistantMessage.id,
      db,
      signal: 'missing-source',
      workspaceAreaId: area.id,
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createTrustSignalEvent({
      chatMessageId: assistantMessage.id,
      db,
      signal: 'helpful',
      workspaceAreaId: area.id,
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createTrustSignalEvent({
      chatMessageId: assistantMessage.id,
      db,
      signal: 'wrong-scope',
      workspaceIndexId: created.workspaceIndex.id,
    });

    expect(areaSignal).toMatchObject({
      event: {
        metadata: {
          signal: 'missing-source',
          workspaceAreaId: area.id,
        },
      },
      status: 'created',
    });
    await expect(
      countRecentNegativeTrustSignals({
        db,
        workspaceAreaId: area.id,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toBe(1);
    await expect(
      countRecentNegativeTrustSignals({
        db,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toBe(2);
    await expect(
      countRecentNegativeTrustSignals({
        db,
        since: new Date(Date.now() + 60_000),
        workspaceAreaId: area.id,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toBe(0);
  });

  it('rejects user messages and messages outside the workspace index scope', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const first = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'first event scope',
      excludePaths: [],
      includePaths: [],
      name: 'First Event Scope',
      parsedRepo,
    });
    const second = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'second event scope',
      excludePaths: [],
      includePaths: [],
      name: 'Second Event Scope',
      parsedRepo,
    });
    workspaceIndexIds.push(first.workspaceIndex.id, second.workspaceIndex.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'Rejected event test',
      workspaceIndexId: first.workspaceIndex.id,
    });
    const userMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'User question.',
      db,
      role: 'user',
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Assistant answer.',
      db,
      role: 'assistant',
    });

    await expect(
      createTrustSignalEvent({
        chatMessageId: userMessage.id,
        db,
        signal: 'not-helpful',
        workspaceIndexId: first.workspaceIndex.id,
      }),
    ).resolves.toMatchObject({
      reason: 'message-not-assistant',
      status: 'not-created',
    });
    await expect(
      createTrustSignalEvent({
        chatMessageId: assistantMessage.id,
        db,
        signal: 'not-helpful',
        workspaceIndexId: second.workspaceIndex.id,
      }),
    ).resolves.toMatchObject({
      reason: 'message-not-found',
      status: 'not-created',
    });
  });
});
