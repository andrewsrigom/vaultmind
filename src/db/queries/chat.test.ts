import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import {
  chatMessages,
  chatSessions,
  documentChunks,
  documents,
  vaults,
  workspaceIndexes,
  workspaceSources,
} from '@/db/schema';
import {
  createChatMessage,
  createRetrievedSources,
  deleteChatSession,
  getChatTranscript,
  getOrCreateChatSession,
  updateChatSessionTitle,
} from '@/db/queries/chat';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const embeddingDimensions = 1536;

async function createVault(db: Db) {
  const uniqueId = crypto.randomUUID();
  const [vault] = await db
    .insert(vaults)
    .values({
      name: `Chat Query Test ${uniqueId}`,
      slug: `chat-query-test-${uniqueId}`,
    })
    .returning();

  if (!vault) {
    throw new Error('Failed to create test vault.');
  }

  return vault;
}

async function createWorkspaceIndex(db: Db, vaultId?: string) {
  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'temporary chat query test',
      name: 'Chat Query Test KB',
      ...(vaultId ? { vaultId } : {}),
    })
    .returning();

  if (!workspaceIndex) {
    throw new Error('Failed to create test workspace index.');
  }

  return workspaceIndex;
}

function createVector(): number[] {
  return Array.from({ length: embeddingDimensions }, (_item, index) => (index === 0 ? 1 : 0));
}

describeWithDatabase('chat queries', () => {
  let db: Db | null = null;
  let vaultIds: string[] = [];
  let workspaceIndexIds: string[] = [];

  beforeEach(() => {
    db = getDb();
    vaultIds = [];
    workspaceIndexIds = [];
  });

  afterEach(async () => {
    if (db) {
      for (const workspaceIndexId of workspaceIndexIds) {
        await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
      }

      for (const vaultId of vaultIds) {
        await db.delete(vaults).where(eq(vaults.id, vaultId));
      }
    }

    db = null;
    vaultIds = [];
    workspaceIndexIds = [];
  });

  it('renames a chat session and deletes it with cascaded messages', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const workspaceIndex = await createWorkspaceIndex(db);
    workspaceIndexIds.push(workspaceIndex.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'Original title',
      workspaceIndexId: workspaceIndex.id,
    });

    await createChatMessage({
      chatSessionId: session.id,
      content: 'Question',
      db,
      role: 'user',
    });

    const renamedSession = await updateChatSessionTitle({
      chatSessionId: session.id,
      db,
      title: 'Renamed chat',
    });

    expect(renamedSession?.title).toBe('Renamed chat');

    const pinnedSession = await updateChatSessionTitle({
      chatSessionId: session.id,
      db,
      isPinned: true,
    });
    const [storedSession] = await db
      .select({ isPinned: chatSessions.isPinned })
      .from(chatSessions)
      .where(eq(chatSessions.id, session.id));

    expect(pinnedSession?.isPinned).toBe(true);
    expect(storedSession?.isPinned).toBe(true);

    const deletedSession = await deleteChatSession({
      chatSessionId: session.id,
      db,
    });
    const remainingMessages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatSessionId, session.id));

    expect(deletedSession?.id).toBe(session.id);
    expect(remainingMessages).toHaveLength(0);
  });

  it('continues an existing chat session when it is inside an allowed workspace scope', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const firstWorkspaceIndex = await createWorkspaceIndex(db);
    const secondWorkspaceIndex = await createWorkspaceIndex(db);

    workspaceIndexIds.push(firstWorkspaceIndex.id, secondWorkspaceIndex.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'Vault scoped chat',
      workspaceIndexId: firstWorkspaceIndex.id,
    });
    const continuedSession = await getOrCreateChatSession({
      allowedWorkspaceIndexIds: [firstWorkspaceIndex.id, secondWorkspaceIndex.id],
      chatSessionId: session.id,
      db,
      title: 'Follow up question',
      workspaceIndexId: secondWorkspaceIndex.id,
    });

    expect(continuedSession.id).toBe(session.id);
    expect(continuedSession.workspaceIndexId).toBe(firstWorkspaceIndex.id);
  });

  it('does not load a transcript from another vault', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const foreignVault = await createVault(db);
    vaultIds.push(foreignVault.id);

    const allowedWorkspaceIndex = await createWorkspaceIndex(db);
    const foreignWorkspaceIndex = await createWorkspaceIndex(db, foreignVault.id);
    workspaceIndexIds.push(allowedWorkspaceIndex.id, foreignWorkspaceIndex.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'Cross-vault chat',
      workspaceIndexId: foreignWorkspaceIndex.id,
    });
    await createChatMessage({
      chatSessionId: session.id,
      content: 'Question from another vault',
      db,
      role: 'user',
    });

    const forbiddenTranscript = await getChatTranscript({
      chatSessionId: session.id,
      db,
      vaultId: allowedWorkspaceIndex.vaultId,
    });
    const allowedTranscript = await getChatTranscript({
      chatSessionId: session.id,
      db,
      vaultId: foreignVault.id,
    });

    expect(forbiddenTranscript).toBeNull();
    expect(allowedTranscript?.messages).toHaveLength(1);
  });

  it('loads latest retrieved sources with area metadata for refreshed transcripts', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const workspaceIndex = await createWorkspaceIndex(db);
    workspaceIndexIds.push(workspaceIndex.id);

    const [source] = await db
      .insert(workspaceSources)
      .values({
        config: {
          branch: 'main',
          includePaths: ['people-hr'],
          owner: 'northstar',
          repo: 'internal-handbook',
          repoUrl: 'https://github.com/northstar/internal-handbook',
        },
        name: 'People & HR',
        type: 'github',
        workspaceIndexId: workspaceIndex.id,
      })
      .returning();

    if (!source) {
      throw new Error('Failed to create test source.');
    }

    const [document] = await db
      .insert(documents)
      .values({
        content: '# PTO\n\nEmployees request PTO in WorkTrack.',
        contentHash: 'chat-query-source-hash',
        externalId: 'github:northstar/internal-handbook:main:people-hr/pto.md',
        path: 'people-hr/pto.md',
        sourceId: source.id,
        sourceType: 'github',
        title: 'PTO Policy',
        workspaceIndexId: workspaceIndex.id,
      })
      .returning();

    if (!document) {
      throw new Error('Failed to create test document.');
    }

    const [chunk] = await db
      .insert(documentChunks)
      .values({
        chunkIndex: 0,
        content: 'Employees request PTO in WorkTrack.',
        documentId: document.id,
        embedding: createVector(),
        sourceId: source.id,
        tokenEstimate: 6,
        workspaceIndexId: workspaceIndex.id,
      })
      .returning();

    if (!chunk) {
      throw new Error('Failed to create test chunk.');
    }

    const session = await getOrCreateChatSession({
      db,
      title: 'PTO question',
      workspaceIndexId: workspaceIndex.id,
    });

    await createChatMessage({
      chatSessionId: session.id,
      content: 'How do I request PTO?',
      db,
      role: 'user',
    });

    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Use WorkTrack. [1]',
      db,
      role: 'assistant',
    });

    await createRetrievedSources({
      chatMessageId: assistantMessage.id,
      db,
      sources: [
        {
          chunkId: chunk.id,
          documentId: document.id,
          similarity: 0.82,
          snippet: 'Employees request PTO in WorkTrack.',
        },
      ],
    });

    const transcript = await getChatTranscript({
      chatSessionId: session.id,
      db,
      vaultId: workspaceIndex.vaultId,
    });

    expect(transcript?.latestSources[0]).toMatchObject({
      path: 'people-hr/pto.md',
      sourceName: 'People & HR',
      workspaceIndexId: workspaceIndex.id,
      workspaceIndexName: workspaceIndex.name,
    });
  });
});
