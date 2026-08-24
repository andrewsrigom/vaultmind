import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import {
  createChatMessage,
  createRetrievedSources,
  getOrCreateChatSession,
} from '@/db/queries/chat';
import { upsertWorkspaceArea } from '@/db/queries/workspace-areas';
import { createWorkspaceIndexWithGitHubSource } from '@/db/queries/workspace-indexes';
import {
  createArticle,
  deleteArticle,
  getVaultArticle,
  listArticles,
  listVaultArticles,
  promoteAssistantMessageToArticle,
  updateArticle,
} from '@/db/queries/articles';
import {
  documentChunks,
  documents,
  workspaceAreas,
  workspaceAreaDocuments,
  workspaceDocs,
  workspaceIndexes,
  knowledgeEvents,
} from '@/db/schema';

import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '@/db';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const embedding = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));
const parsedRepo = {
  owner: 'openai',
  repo: 'openai-cookbook',
  repoUrl: 'https://github.com/openai/openai-cookbook',
} as const;

describeWithDatabase('article queries', () => {
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
      for (const workspaceIndexId of workspaceIndexIds) {
        await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
      }

      for (const workspaceAreaId of workspaceAreaIds) {
        await db.delete(workspaceAreas).where(eq(workspaceAreas.id, workspaceAreaId));
      }
    }

    db = null;
    workspaceAreaIds = [];
    workspaceIndexIds = [];
  });

  it('promotes an assistant answer into draft article with source references', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary article test',
      excludePaths: [],
      includePaths: [],
      name: 'Article Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);
    const area = await upsertWorkspaceArea({
      db,
      description: 'Credit policy and approval workflows.',
      name: 'Credit Policy',
      origin: 'manual',
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(area.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'article promotion',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createChatMessage({
      chatSessionId: session.id,
      content: 'What is the credit exception process?',
      db,
      role: 'user',
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Credit exceptions require manager approval and documented rationale.',
      db,
      role: 'assistant',
    });
    const [document] = await db
      .insert(documents)
      .values({
        content: 'Credit exceptions require manager approval and documented rationale.',
        contentHash: 'article-test-hash',
        externalId: 'credit-policy.md',
        path: 'policies/credit-policy.md',
        sourceId: created.source.id,
        sourceType: created.source.type,
        title: 'Credit Policy',
        workspaceIndexId: created.workspaceIndex.id,
      })
      .returning();

    if (!document) {
      throw new Error('Failed to create test document.');
    }

    const [chunk] = await db
      .insert(documentChunks)
      .values({
        chunkIndex: 0,
        content: document.content,
        documentId: document.id,
        embedding,
        sourceId: created.source.id,
        tokenEstimate: 12,
        workspaceIndexId: created.workspaceIndex.id,
      })
      .returning();

    if (!chunk) {
      throw new Error('Failed to create test chunk.');
    }

    await createRetrievedSources({
      chatMessageId: assistantMessage.id,
      db,
      sources: [
        {
          chunkId: chunk.id,
          documentId: document.id,
          similarity: 0.87,
          snippet: 'Credit exceptions require manager approval.',
        },
      ],
    });

    const result = await promoteAssistantMessageToArticle({
      assistantMessageId: assistantMessage.id,
      db,
      workspaceAreaId: area.id,
      workspaceIndexId: created.workspaceIndex.id,
    });

    expect(result.status).toBe('created');

    if (result.status !== 'created') {
      throw new Error('Expected article to be created.');
    }

    expect(result.article).toMatchObject({
      content: assistantMessage.content,
      question: 'What is the credit exception process?',
      sourceAssistantMessageId: assistantMessage.id,
      sourceChatSessionId: session.id,
      status: 'draft',
      vaultId: created.workspaceIndex.vaultId,
      workspaceAreaId: area.id,
      workspaceIndexId: created.workspaceIndex.id,
    });
    expect(result.article.sourceReferences).toEqual([
      expect.objectContaining({
        citationIndex: 1,
        documentId: document.id,
        path: document.path,
        sourceId: created.source.id,
        sourceName: created.source.name,
        sourceType: created.source.type,
        title: document.title,
      }),
    ]);

    await expect(
      db
        .select()
        .from(knowledgeEvents)
        .where(
          and(
            eq(knowledgeEvents.chatMessageId, assistantMessage.id),
            eq(knowledgeEvents.type, 'article-created'),
          ),
        ),
    ).resolves.toHaveLength(1);
  });

  it('creates a manual saved article without chat source references', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary manual article test',
      excludePaths: [],
      includePaths: [],
      name: 'Manual Article Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);

    const article = await createArticle({
      content: 'Employees submit PTO in the HR portal.',
      db,
      question: 'How do employees submit PTO?',
      workspaceIndexId: created.workspaceIndex.id,
    });

    if (!article) {
      throw new Error('Expected article to be created.');
    }

    expect(article).toMatchObject({
      content: 'Employees submit PTO in the HR portal.',
      question: 'How do employees submit PTO?',
      sourceAssistantMessageId: null,
      sourceChatSessionId: null,
      sourceReferences: [],
      status: 'draft',
      vaultId: created.workspaceIndex.vaultId,
      workspaceIndexId: created.workspaceIndex.id,
    });
    await expect(
      getVaultArticle({
        articleId: article.id,
        db,
        vaultId: created.workspaceIndex.vaultId,
      }),
    ).resolves.toMatchObject({
      content: article.content,
      id: article.id,
      vaultId: created.workspaceIndex.vaultId,
    });

    await expect(
      getVaultArticle({
        articleId: article.id,
        db,
        vaultId: '00000000-0000-4000-8000-000000000999',
      }),
    ).resolves.toBeNull();

    await expect(
      db
        .select()
        .from(knowledgeEvents)
        .where(
          and(
            eq(knowledgeEvents.workspaceIndexId, created.workspaceIndex.id),
            eq(knowledgeEvents.type, 'article-created'),
          ),
        ),
    ).resolves.toHaveLength(1);
  });

  it('does not promote a chat answer when no article area can be resolved', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary article no area test',
      excludePaths: [],
      includePaths: [],
      name: 'Article No Area Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);
    const area = await upsertWorkspaceArea({
      db,
      description: 'Onboarding docs and checklists.',
      name: 'Onboarding',
      origin: 'manual',
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(area.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'article promotion without area',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createChatMessage({
      chatSessionId: session.id,
      content: 'Where should this article live?',
      db,
      role: 'user',
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'This answer does not have enough area context.',
      db,
      role: 'assistant',
    });

    await expect(
      promoteAssistantMessageToArticle({
        assistantMessageId: assistantMessage.id,
        db,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toEqual({
      reason: 'area-not-inferred',
      status: 'not-created',
    });
    await expect(
      listArticles({
        db,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toHaveLength(0);
  });

  it('links promoted article to a semantic area and filters vault articles by area', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary area article test',
      excludePaths: [],
      includePaths: [],
      name: 'Area Article Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);

    const area = await upsertWorkspaceArea({
      db,
      description: 'Security policies and access procedures.',
      name: 'IT & Security',
      origin: 'manual',
      vaultId: created.workspaceIndex.vaultId,
    });
    const otherArea = await upsertWorkspaceArea({
      db,
      description: 'Finance policies.',
      name: 'Finance',
      origin: 'manual',
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(area.id, otherArea.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'Area article promotion',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createChatMessage({
      chatSessionId: session.id,
      content: 'How do employees request access?',
      db,
      role: 'user',
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Employees request access through the IT service desk.',
      db,
      role: 'assistant',
    });

    const result = await promoteAssistantMessageToArticle({
      assistantMessageId: assistantMessage.id,
      db,
      workspaceAreaId: area.id,
      workspaceIndexId: created.workspaceIndex.id,
    });

    expect(result.status).toBe('created');

    if (result.status !== 'created') {
      throw new Error('Expected article to be created.');
    }

    expect(result.article.workspaceAreaId).toBe(area.id);
    await expect(
      listVaultArticles({
        db,
        vaultId: created.workspaceIndex.vaultId,
        workspaceAreaId: area.id,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      listVaultArticles({
        db,
        vaultId: created.workspaceIndex.vaultId,
        workspaceAreaId: otherArea.id,
      }),
    ).resolves.toHaveLength(0);
  });

  it('infers the promoted article area from retrieved source documents', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary inferred area article test',
      excludePaths: [],
      includePaths: [],
      name: 'Inferred Area Article Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);

    const peopleArea = await upsertWorkspaceArea({
      db,
      description: 'Benefits, leave, and employee policy docs.',
      name: 'People & HR',
      origin: 'manual',
      vaultId: created.workspaceIndex.vaultId,
    });
    const supportArea = await upsertWorkspaceArea({
      db,
      description: 'Support routing and employee help desk docs.',
      name: 'Support',
      origin: 'manual',
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(peopleArea.id, supportArea.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'inferred area promotion',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createChatMessage({
      chatSessionId: session.id,
      content: 'benefits',
      db,
      role: 'user',
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Benefits are owned by People & HR and include health coverage.',
      db,
      role: 'assistant',
    });
    const documentRows = await db
      .insert(documents)
      .values([
        {
          content: 'Benefits overview and health coverage.',
          contentHash: 'benefits-overview-hash',
          externalId: 'people-hr/benefits-overview.md',
          path: 'people-hr/benefits-overview.md',
          sourceId: created.source.id,
          sourceType: created.source.type,
          title: 'Benefits Overview',
          workspaceIndexId: created.workspaceIndex.id,
        },
        {
          content: 'Parental leave keeps benefits active.',
          contentHash: 'parental-leave-hash',
          externalId: 'people-hr/parental-leave.md',
          path: 'people-hr/parental-leave.md',
          sourceId: created.source.id,
          sourceType: created.source.type,
          title: 'Parental Leave',
          workspaceIndexId: created.workspaceIndex.id,
        },
        {
          content: 'Support routes policy questions.',
          contentHash: 'support-routing-hash',
          externalId: 'support/policy-routing.md',
          path: 'support/policy-routing.md',
          sourceId: created.source.id,
          sourceType: created.source.type,
          title: 'Policy Routing',
          workspaceIndexId: created.workspaceIndex.id,
        },
      ])
      .returning();

    if (documentRows.length !== 3) {
      throw new Error('Failed to create inferred area test documents.');
    }

    const chunkRows = await db
      .insert(documentChunks)
      .values(
        documentRows.map((document, index) => ({
          chunkIndex: 0,
          content: document.content,
          documentId: document.id,
          embedding,
          sourceId: created.source.id,
          tokenEstimate: 12 + index,
          workspaceIndexId: created.workspaceIndex.id,
        })),
      )
      .returning();

    if (chunkRows.length !== 3) {
      throw new Error('Failed to create inferred area test chunks.');
    }

    await db.insert(workspaceAreaDocuments).values([
      {
        confidence: 1,
        documentId: documentRows[0]!.id,
        reason: 'Test dominant People source.',
        vaultId: created.workspaceIndex.vaultId,
        workspaceAreaId: peopleArea.id,
      },
      {
        confidence: 1,
        documentId: documentRows[1]!.id,
        reason: 'Test dominant People source.',
        vaultId: created.workspaceIndex.vaultId,
        workspaceAreaId: peopleArea.id,
      },
      {
        confidence: 1,
        documentId: documentRows[2]!.id,
        reason: 'Test secondary Support source.',
        vaultId: created.workspaceIndex.vaultId,
        workspaceAreaId: supportArea.id,
      },
    ]);

    await createRetrievedSources({
      chatMessageId: assistantMessage.id,
      db,
      sources: chunkRows.map((chunk, index) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        similarity: index === 2 ? 0.2 : 0.4,
        snippet: chunk.content,
      })),
    });

    const result = await promoteAssistantMessageToArticle({
      assistantMessageId: assistantMessage.id,
      db,
      workspaceIndexId: created.workspaceIndex.id,
    });

    expect(result.status).toBe('created');

    if (result.status !== 'created') {
      throw new Error('Expected article to be created.');
    }

    expect(result.article.workspaceAreaId).toBe(peopleArea.id);
  });

  it('does not duplicate article for the same assistant message', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary article duplicate test',
      excludePaths: [],
      includePaths: [],
      name: 'Article Duplicate Test',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id);
    const area = await upsertWorkspaceArea({
      db,
      description: 'Onboarding docs and checklists.',
      name: 'Onboarding',
      origin: 'manual',
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(area.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'article duplicate',
      workspaceIndexId: created.workspaceIndex.id,
    });
    await createChatMessage({
      chatSessionId: session.id,
      content: 'How do we handle onboarding?',
      db,
      role: 'user',
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Use the onboarding checklist.',
      db,
      role: 'assistant',
    });

    const firstResult = await promoteAssistantMessageToArticle({
      assistantMessageId: assistantMessage.id,
      db,
      workspaceAreaId: area.id,
      workspaceIndexId: created.workspaceIndex.id,
    });
    const secondResult = await promoteAssistantMessageToArticle({
      assistantMessageId: assistantMessage.id,
      db,
      workspaceAreaId: area.id,
      workspaceIndexId: created.workspaceIndex.id,
    });

    expect(firstResult.status).toBe('created');
    expect(secondResult.status).toBe('already-exists');

    if (firstResult.status === 'not-created' || secondResult.status === 'not-created') {
      throw new Error('Expected duplicate promotion to return the existing article.');
    }

    expect(secondResult.article.id).toBe(firstResult.article.id);
    await expect(
      listArticles({
        db,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      listArticles({
        db,
        status: 'draft',
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      listArticles({
        db,
        status: 'approved',
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toHaveLength(0);
  });

  it('updates and deletes article records within the workspace index scope', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const created = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary article update test',
      excludePaths: [],
      includePaths: [],
      name: 'Article Update Test',
      parsedRepo,
    });
    const other = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'temporary article other scope',
      excludePaths: [],
      includePaths: [],
      name: 'Article Other Scope',
      parsedRepo,
    });
    workspaceIndexIds.push(created.workspaceIndex.id, other.workspaceIndex.id);
    const area = await upsertWorkspaceArea({
      db,
      description: 'Article maintenance workflows.',
      name: 'Article Maintenance',
      origin: 'manual',
      vaultId: created.workspaceIndex.vaultId,
    });
    workspaceAreaIds.push(area.id);

    const article = await createArticle({
      content: 'This answer should be edited.',
      db,
      question: 'What should be edited?',
      workspaceAreaId: area.id,
      workspaceIndexId: created.workspaceIndex.id,
    });

    if (!article) {
      throw new Error('Expected article to be created.');
    }

    await expect(
      updateArticle({
        articleId: article.id,
        content: 'Wrong scope update.',
        db,
        question: 'Wrong scope?',
        workspaceIndexId: other.workspaceIndex.id,
      }),
    ).resolves.toBeNull();

    const updated = await updateArticle({
      articleId: article.id,
      content: 'Edited answer.',
      db,
      question: 'Edited title?',
      status: 'in-review',
      workspaceIndexId: created.workspaceIndex.id,
    });

    expect(updated).toMatchObject({
      content: 'Edited answer.',
      id: article.id,
      question: 'Edited title?',
      status: 'in-review',
    });

    const [updatedWorkspaceDoc] = await db
      .select({
        content: workspaceDocs.content,
        status: workspaceDocs.status,
        title: workspaceDocs.title,
      })
      .from(workspaceDocs)
      .where(sql`${workspaceDocs.metadata}->>'articleId' = ${article.id}`);

    expect(updatedWorkspaceDoc).toMatchObject({
      content: 'Edited answer.',
      status: 'in-review',
      title: 'Edited title?',
    });
    await expect(
      deleteArticle({
        articleId: article.id,
        db,
        workspaceIndexId: other.workspaceIndex.id,
      }),
    ).resolves.toBeNull();
    await expect(
      deleteArticle({
        articleId: article.id,
        db,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toMatchObject({
      id: article.id,
    });
    await expect(
      listArticles({
        db,
        workspaceIndexId: created.workspaceIndex.id,
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects non-assistant messages and messages outside the workspace index scope', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const first = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'first article scope',
      excludePaths: [],
      includePaths: [],
      name: 'First Article Scope',
      parsedRepo,
    });
    const second = await createWorkspaceIndexWithGitHubSource({
      branch: 'main',
      description: 'second article scope',
      excludePaths: [],
      includePaths: [],
      name: 'Second Article Scope',
      parsedRepo,
    });
    workspaceIndexIds.push(first.workspaceIndex.id, second.workspaceIndex.id);

    const session = await getOrCreateChatSession({
      db,
      title: 'article rejection',
      workspaceIndexId: first.workspaceIndex.id,
    });
    const userMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Can this become an article?',
      db,
      role: 'user',
    });
    const assistantMessage = await createChatMessage({
      chatSessionId: session.id,
      content: 'Only this answer could become an article.',
      db,
      role: 'assistant',
    });

    await expect(
      promoteAssistantMessageToArticle({
        assistantMessageId: userMessage.id,
        db,
        workspaceIndexId: first.workspaceIndex.id,
      }),
    ).resolves.toMatchObject({
      reason: 'message-not-assistant',
      status: 'not-created',
    });
    await expect(
      promoteAssistantMessageToArticle({
        assistantMessageId: assistantMessage.id,
        db,
        workspaceIndexId: second.workspaceIndex.id,
      }),
    ).resolves.toMatchObject({
      reason: 'message-not-found',
      status: 'not-created',
    });
  });
});
