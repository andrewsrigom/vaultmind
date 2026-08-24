import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { createKnowledgeEvent } from '@/db/queries/knowledge-events';
import { createWorkspaceDoc } from '@/db/queries/workspace-docs';
import {
  articles,
  chatMessages,
  chatSessions,
  documents,
  workspaceIndexes,
  workspaceSources,
  workspaceAreas,
  workspaceAreaDocuments,
  workspaceDocs,
  retrievedSources,
} from '@/db/schema';

import type { Db } from '@/db';
import type {
  Article,
  ArticleSourceReference,
  ArticleStatus,
  WorkspaceDocStatus,
} from '@/db/schema';

export type PromoteAssistantMessageToArticleInput = {
  assistantMessageId: string;
  db?: Db;
  status?: ArticleStatus;
  workspaceAreaId?: string | null;
  workspaceIndexId: string;
};

export type CreateArticleInput = {
  content: string;
  db?: Db;
  question: string;
  status?: ArticleStatus;
  workspaceAreaId?: string | null;
  workspaceIndexId: string;
};

export type ListArticlesInput = {
  db?: Db;
  workspaceAreaId?: string | null;
  workspaceIndexId: string;
  status?: ArticleStatus | null;
};

export type ListVaultArticlesInput = {
  db?: Db;
  vaultId: string;
  status?: ArticleStatus | null;
  workspaceAreaId?: string | null;
};

export type GetVaultArticleInput = {
  articleId: string;
  db?: Db;
  vaultId: string;
};

export type UpdateArticleInput = {
  articleId: string;
  content: string;
  db?: Db;
  workspaceIndexId: string;
  question: string;
  status?: ArticleStatus;
};

export type DeleteArticleInput = {
  articleId: string;
  db?: Db;
  workspaceIndexId: string;
};

export type PromoteAssistantMessageToArticleResult =
  | {
      article: Article;
      status: 'already-exists' | 'created';
    }
  | {
      reason:
        | 'area-not-found'
        | 'area-not-inferred'
        | 'message-not-assistant'
        | 'message-not-found'
        | 'question-not-found';
      status: 'not-created';
    };

function requireRow<TValue>(row: TValue | undefined, message: string): TValue {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

function getArticleWorkspaceDocStatus(status: ArticleStatus): WorkspaceDocStatus {
  const statuses = {
    approved: 'published',
    deprecated: 'deprecated',
    draft: 'draft',
    'in-review': 'in-review',
    'needs-update': 'needs-update',
  } satisfies Record<ArticleStatus, WorkspaceDocStatus>;

  return statuses[status];
}

async function resolveWorkspaceAreaId({
  db,
  vaultId,
  workspaceAreaId,
}: {
  db: Db;
  vaultId: string;
  workspaceAreaId?: string | null;
}): Promise<string | null | undefined> {
  if (!workspaceAreaId) {
    return null;
  }

  const [workspaceArea] = await db
    .select({
      id: workspaceAreas.id,
    })
    .from(workspaceAreas)
    .where(and(eq(workspaceAreas.id, workspaceAreaId), eq(workspaceAreas.vaultId, vaultId)))
    .limit(1);

  return workspaceArea?.id;
}

async function inferWorkspaceAreaIdFromRetrievedSources({
  assistantMessageId,
  db,
  vaultId,
}: {
  assistantMessageId: string;
  db: Db;
  vaultId: string;
}): Promise<string | null> {
  const sourceAreaRows = await db
    .select({
      similarity: retrievedSources.similarity,
      workspaceAreaId: workspaceAreaDocuments.workspaceAreaId,
    })
    .from(retrievedSources)
    .innerJoin(
      workspaceAreaDocuments,
      and(
        eq(workspaceAreaDocuments.documentId, retrievedSources.documentId),
        eq(workspaceAreaDocuments.vaultId, vaultId),
      ),
    )
    .where(eq(retrievedSources.chatMessageId, assistantMessageId));

  if (sourceAreaRows.length === 0) {
    return null;
  }

  const areaScores = new Map<string, { count: number; similarity: number }>();

  for (const sourceArea of sourceAreaRows) {
    const currentScore = areaScores.get(sourceArea.workspaceAreaId) ?? {
      count: 0,
      similarity: 0,
    };

    areaScores.set(sourceArea.workspaceAreaId, {
      count: currentScore.count + 1,
      similarity: currentScore.similarity + sourceArea.similarity,
    });
  }

  const [topArea, secondArea] = Array.from(areaScores.entries()).sort((firstArea, secondArea) => {
    const countDifference = secondArea[1].count - firstArea[1].count;

    if (countDifference !== 0) {
      return countDifference;
    }

    return secondArea[1].similarity - firstArea[1].similarity;
  });

  if (!topArea) {
    return null;
  }

  if (
    secondArea &&
    topArea[1].count === secondArea[1].count &&
    topArea[1].similarity === secondArea[1].similarity
  ) {
    return null;
  }

  return topArea[0];
}

export async function createArticle({
  content,
  db = getDb(),
  question,
  status = 'draft',
  workspaceAreaId = null,
  workspaceIndexId,
}: CreateArticleInput): Promise<Article | null> {
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

  const resolvedWorkspaceAreaId = await resolveWorkspaceAreaId({
    db,
    vaultId: workspaceIndex.vaultId,
    workspaceAreaId,
  });

  if (resolvedWorkspaceAreaId === undefined) {
    return null;
  }

  const [article] = await db
    .insert(articles)
    .values({
      content,
      question,
      sourceReferences: [],
      status,
      vaultId: workspaceIndex.vaultId,
      workspaceAreaId: resolvedWorkspaceAreaId,
      workspaceIndexId,
    })
    .returning();
  const createdArticle = requireRow(article, 'Failed to create article.');

  await createKnowledgeEvent({
    db,
    metadata: {
      articleId: createdArticle.id,
      source: 'manual',
      status,
      ...(resolvedWorkspaceAreaId ? { workspaceAreaId: resolvedWorkspaceAreaId } : {}),
    },
    type: 'article-created',
    vaultId: workspaceIndex.vaultId,
    workspaceIndexId,
  });

  if (resolvedWorkspaceAreaId) {
    await createWorkspaceDoc({
      content,
      db,
      docType: 'article',
      metadata: {
        articleId: createdArticle.id,
        source: 'article',
        workspaceIndexId,
      },
      status: getArticleWorkspaceDocStatus(status),
      tags: ['article'],
      title: question,
      vaultId: workspaceIndex.vaultId,
      workspaceAreaId: resolvedWorkspaceAreaId,
    });
  }

  return createdArticle;
}

export async function listArticles({
  db = getDb(),
  status = null,
  workspaceAreaId = null,
  workspaceIndexId,
}: ListArticlesInput): Promise<Article[]> {
  const filters = [
    eq(articles.workspaceIndexId, workspaceIndexId),
    ...(status ? [eq(articles.status, status)] : []),
    ...(workspaceAreaId ? [eq(articles.workspaceAreaId, workspaceAreaId)] : []),
  ];

  return db
    .select()
    .from(articles)
    .where(and(...filters))
    .orderBy(desc(articles.updatedAt));
}

export async function listVaultArticles({
  db = getDb(),
  status = null,
  vaultId,
  workspaceAreaId = null,
}: ListVaultArticlesInput): Promise<Article[]> {
  const filters = [
    eq(articles.vaultId, vaultId),
    ...(status ? [eq(articles.status, status)] : []),
    ...(workspaceAreaId ? [eq(articles.workspaceAreaId, workspaceAreaId)] : []),
  ];

  return db
    .select()
    .from(articles)
    .where(and(...filters))
    .orderBy(desc(articles.updatedAt));
}

export async function getVaultArticle({
  articleId,
  db = getDb(),
  vaultId,
}: GetVaultArticleInput): Promise<Article | null> {
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.vaultId, vaultId)))
    .limit(1);

  return article ?? null;
}

export async function updateArticle({
  articleId,
  content,
  db = getDb(),
  question,
  status,
  workspaceIndexId,
}: UpdateArticleInput): Promise<Article | null> {
  const article = await db.transaction(async (tx) => {
    const now = new Date();
    const [updatedArticle] = await tx
      .update(articles)
      .set({
        content,
        question,
        ...(status ? { status } : {}),
        updatedAt: now,
      })
      .where(and(eq(articles.id, articleId), eq(articles.workspaceIndexId, workspaceIndexId)))
      .returning();

    if (!updatedArticle) {
      return null;
    }

    await tx
      .update(workspaceDocs)
      .set({
        content,
        ...(status ? { status: getArticleWorkspaceDocStatus(status) } : {}),
        title: question,
        updatedAt: now,
      })
      .where(
        and(
          eq(workspaceDocs.vaultId, updatedArticle.vaultId),
          eq(workspaceDocs.docType, 'article'),
          sql`${workspaceDocs.metadata}->>'articleId' = ${articleId}`,
        ),
      );

    return updatedArticle;
  });

  return article ?? null;
}

export async function deleteArticle({
  articleId,
  db = getDb(),
  workspaceIndexId,
}: DeleteArticleInput): Promise<Article | null> {
  const [article] = await db
    .delete(articles)
    .where(and(eq(articles.id, articleId), eq(articles.workspaceIndexId, workspaceIndexId)))
    .returning();

  return article ?? null;
}

export async function promoteAssistantMessageToArticle({
  assistantMessageId,
  db = getDb(),
  status = 'draft',
  workspaceAreaId = null,
  workspaceIndexId,
}: PromoteAssistantMessageToArticleInput): Promise<PromoteAssistantMessageToArticleResult> {
  const [message] = await db
    .select({
      chatSessionId: chatMessages.chatSessionId,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
      role: chatMessages.role,
      vaultId: workspaceIndexes.vaultId,
      workspaceIndexId: chatSessions.workspaceIndexId,
    })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.chatSessionId, chatSessions.id))
    .innerJoin(workspaceIndexes, eq(chatSessions.workspaceIndexId, workspaceIndexes.id))
    .where(
      and(
        eq(chatMessages.id, assistantMessageId),
        eq(chatSessions.workspaceIndexId, workspaceIndexId),
      ),
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

  const resolvedWorkspaceAreaId = await resolveWorkspaceAreaId({
    db,
    vaultId: message.vaultId,
    workspaceAreaId,
  });

  if (resolvedWorkspaceAreaId === undefined) {
    return {
      reason: 'area-not-found',
      status: 'not-created',
    };
  }
  const articleWorkspaceAreaId =
    resolvedWorkspaceAreaId ??
    (await inferWorkspaceAreaIdFromRetrievedSources({
      assistantMessageId,
      db,
      vaultId: message.vaultId,
    }));

  if (!articleWorkspaceAreaId) {
    return {
      reason: 'area-not-inferred',
      status: 'not-created',
    };
  }

  const [existingArticle] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.workspaceIndexId, workspaceIndexId),
        eq(articles.sourceAssistantMessageId, assistantMessageId),
      ),
    )
    .limit(1);

  if (existingArticle) {
    if (articleWorkspaceAreaId && existingArticle.workspaceAreaId !== articleWorkspaceAreaId) {
      const [updatedArticle] = await db
        .update(articles)
        .set({
          updatedAt: new Date(),
          workspaceAreaId: articleWorkspaceAreaId,
        })
        .where(eq(articles.id, existingArticle.id))
        .returning();

      return {
        article: updatedArticle ?? existingArticle,
        status: 'already-exists',
      };
    }

    return {
      article: existingArticle,
      status: 'already-exists',
    };
  }

  const [questionMessage] = await db
    .select({
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.chatSessionId, message.chatSessionId),
        eq(chatMessages.role, 'user'),
        lt(chatMessages.createdAt, message.createdAt),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);

  if (!questionMessage) {
    return {
      reason: 'question-not-found',
      status: 'not-created',
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
      sourceMetadata: documents.sourceMetadata,
      sourceName: workspaceSources.name,
      sourceType: documents.sourceType,
      title: documents.title,
    })
    .from(retrievedSources)
    .innerJoin(documents, eq(documents.id, retrievedSources.documentId))
    .innerJoin(workspaceSources, eq(documents.sourceId, workspaceSources.id))
    .where(eq(retrievedSources.chatMessageId, assistantMessageId))
    .orderBy(asc(retrievedSources.createdAt));
  const sourceReferences = sourceRows.map(
    (source, index) =>
      ({
        ...source,
        ...(source.sourceMetadata === null ? {} : { sourceMetadata: source.sourceMetadata }),
        citationIndex: index + 1,
      }) satisfies ArticleSourceReference,
  );

  const [article] = await db
    .insert(articles)
    .values({
      content: message.content,
      question: questionMessage.content,
      sourceAssistantMessageId: assistantMessageId,
      sourceChatSessionId: message.chatSessionId,
      sourceReferences,
      status,
      vaultId: message.vaultId,
      workspaceAreaId: articleWorkspaceAreaId,
      workspaceIndexId: message.workspaceIndexId,
    })
    .returning();
  const createdArticle = requireRow(article, 'Failed to create article.');

  await createKnowledgeEvent({
    chatMessageId: assistantMessageId,
    chatSessionId: message.chatSessionId,
    db,
    metadata: {
      articleId: createdArticle.id,
      sourceReferenceCount: sourceReferences.length,
      status,
      ...(articleWorkspaceAreaId ? { workspaceAreaId: articleWorkspaceAreaId } : {}),
    },
    type: 'article-created',
    vaultId: message.vaultId,
    workspaceIndexId: message.workspaceIndexId,
  });

  return {
    article: createdArticle,
    status: 'created',
  };
}
