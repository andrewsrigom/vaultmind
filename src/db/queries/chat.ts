import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  chatMessages,
  chatSessions,
  documents,
  workspaceIndexes,
  workspaceSources,
  retrievedSources,
} from '@/db/schema';

import type { Db } from '@/db';
import type {
  ChatMessage,
  ChatMessageRole,
  ChatSession,
  WorkspaceSourceType,
  NewRetrievedSource,
  RetrievedSource,
} from '@/db/schema';

export type CreateChatMessageInput = {
  chatSessionId: string;
  content: string;
  db?: Db;
  role: ChatMessageRole;
};

export type CreateRetrievedSourcesInput = {
  chatMessageId: string;
  db?: Db;
  sources: Omit<NewRetrievedSource, 'chatMessageId'>[];
};

export type DeleteChatSessionInput = {
  chatSessionId: string;
  db?: Db;
};

export type GetChatTranscriptInput = {
  chatSessionId: string;
  db?: Db;
  vaultId: string;
};

export type GetOrCreateActiveChatSessionInput = {
  allowedWorkspaceIndexIds?: string[];
  chatSessionId?: string | null;
  db?: Db;
  workspaceIndexId: string;
  title: string;
};

export type UpdateChatSessionTitleInput = {
  chatSessionId: string;
  db?: Db;
  isPinned?: boolean;
  title?: string;
};

export type ChatHistoryItem = {
  id: string;
  workspaceIndexId: string;
  workspaceIndexName: string;
  isPinned: boolean;
  vaultId: string;
  title: string;
  updatedAt: Date;
};

export type ChatTranscriptSource = {
  chunkId: string;
  citationIndex: number;
  documentId: string;
  workspaceIndexId: string;
  workspaceIndexName: string;
  path: string;
  similarity: number;
  snippet: string;
  sourceId: string;
  sourceName: string;
  sourceType: WorkspaceSourceType;
  title: string;
};

export type ChatTranscript = {
  latestSources: ChatTranscriptSource[];
  messages: ChatMessage[];
  session: ChatSession;
};

export class ChatSessionNotFoundError extends Error {
  constructor() {
    super('Chat session was not found.');
  }
}

function requireRow<TValue>(row: TValue | undefined, message: string): TValue {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

export async function createChatMessage({
  chatSessionId,
  content,
  db = getDb(),
  role,
}: CreateChatMessageInput): Promise<ChatMessage> {
  const [message] = await db
    .insert(chatMessages)
    .values({
      chatSessionId,
      content,
      role,
    })
    .returning();

  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, chatSessionId));

  return requireRow(message, 'Failed to create chat message.');
}

export async function createRetrievedSources({
  chatMessageId,
  db = getDb(),
  sources,
}: CreateRetrievedSourcesInput): Promise<RetrievedSource[]> {
  if (sources.length === 0) {
    return [];
  }

  return db
    .insert(retrievedSources)
    .values(
      sources.map((source) => ({
        ...source,
        chatMessageId,
      })),
    )
    .returning();
}

export async function getOrCreateChatSession({
  allowedWorkspaceIndexIds,
  chatSessionId,
  db = getDb(),
  title,
  workspaceIndexId,
}: GetOrCreateActiveChatSessionInput): Promise<ChatSession> {
  if (chatSessionId) {
    const workspaceScope = allowedWorkspaceIndexIds?.length
      ? inArray(chatSessions.workspaceIndexId, allowedWorkspaceIndexIds)
      : eq(chatSessions.workspaceIndexId, workspaceIndexId);
    const [existingSession] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, chatSessionId), workspaceScope))
      .limit(1);

    if (!existingSession) {
      throw new ChatSessionNotFoundError();
    }

    return existingSession;
  }

  const [session] = await db
    .insert(chatSessions)
    .values({
      title,
      workspaceIndexId,
    })
    .returning();

  return requireRow(session, 'Failed to create chat session.');
}

export async function updateChatSessionTitle({
  chatSessionId,
  db = getDb(),
  isPinned,
  title,
}: UpdateChatSessionTitleInput): Promise<ChatSession | null> {
  const values: Partial<Pick<ChatSession, 'isPinned' | 'title' | 'updatedAt'>> = {
    updatedAt: new Date(),
  };

  if (title !== undefined) {
    values.title = title;
  }

  if (isPinned !== undefined) {
    values.isPinned = isPinned;
  }

  const [session] = await db
    .update(chatSessions)
    .set(values)
    .where(eq(chatSessions.id, chatSessionId))
    .returning();

  return session ?? null;
}

export async function deleteChatSession({
  chatSessionId,
  db = getDb(),
}: DeleteChatSessionInput): Promise<ChatSession | null> {
  const [session] = await db
    .delete(chatSessions)
    .where(eq(chatSessions.id, chatSessionId))
    .returning();

  return session ?? null;
}

export async function getChatSessionById({
  chatSessionId,
  db = getDb(),
}: DeleteChatSessionInput): Promise<ChatSession | null> {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, chatSessionId))
    .limit(1);

  return session ?? null;
}

export async function getChatTranscript({
  chatSessionId,
  db = getDb(),
  vaultId,
}: GetChatTranscriptInput): Promise<ChatTranscript | null> {
  const [sessionRow] = await db
    .select({ session: chatSessions })
    .from(chatSessions)
    .innerJoin(workspaceIndexes, eq(workspaceIndexes.id, chatSessions.workspaceIndexId))
    .where(and(eq(chatSessions.id, chatSessionId), eq(workspaceIndexes.vaultId, vaultId)))
    .limit(1);
  const session = sessionRow?.session;

  if (!session) {
    return null;
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatSessionId, session.id))
    .orderBy(asc(chatMessages.createdAt));
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');

  if (!latestAssistantMessage) {
    return {
      latestSources: [],
      messages,
      session,
    };
  }

  const sourceRows = await db
    .select({
      chunkId: retrievedSources.chunkId,
      documentId: retrievedSources.documentId,
      path: documents.path,
      similarity: retrievedSources.similarity,
      snippet: retrievedSources.snippet,
      sourceId: documents.sourceId,
      sourceName: workspaceSources.name,
      sourceType: documents.sourceType,
      title: documents.title,
      workspaceIndexId: documents.workspaceIndexId,
      workspaceIndexName: workspaceIndexes.name,
    })
    .from(retrievedSources)
    .innerJoin(documents, eq(documents.id, retrievedSources.documentId))
    .innerJoin(workspaceIndexes, eq(documents.workspaceIndexId, workspaceIndexes.id))
    .innerJoin(workspaceSources, eq(documents.sourceId, workspaceSources.id))
    .where(
      and(
        eq(retrievedSources.chatMessageId, latestAssistantMessage.id),
        eq(workspaceIndexes.vaultId, vaultId),
      ),
    )
    .orderBy(asc(retrievedSources.createdAt));

  return {
    latestSources: sourceRows.map((source, index) => ({
      ...source,
      citationIndex: index + 1,
    })),
    messages,
    session,
  };
}

export async function listChatHistory({
  db = getDb(),
  limit = 50,
  vaultId = null,
}: {
  db?: Db;
  limit?: number;
  vaultId?: string | null;
} = {}): Promise<ChatHistoryItem[]> {
  let query = db
    .select({
      id: chatSessions.id,
      isPinned: chatSessions.isPinned,
      title: chatSessions.title,
      updatedAt: chatSessions.updatedAt,
      vaultId: workspaceIndexes.vaultId,
      workspaceIndexId: chatSessions.workspaceIndexId,
      workspaceIndexName: workspaceIndexes.name,
    })
    .from(chatSessions)
    .innerJoin(workspaceIndexes, eq(workspaceIndexes.id, chatSessions.workspaceIndexId))
    .$dynamic();

  const filters = vaultId ? [eq(workspaceIndexes.vaultId, vaultId)] : [];

  if (filters.length > 0) {
    query = query.where(and(...filters));
  }

  return query.orderBy(desc(chatSessions.isPinned), desc(chatSessions.updatedAt)).limit(limit);
}
