import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { chatMessages, retrievedSources, workspaceIndexes, workspaceSources } from '@/db/schema';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { generateAnswer } from '@/lib/rag/generate-answer';
import { ingestDocuments } from '@/lib/rag/ingest-documents';
import { hashContent } from '@/lib/sources/hash-content';

import type { Db } from '@/db';
import type { ChatProvider, ChatProviderMessage } from '@/lib/providers/chat-provider';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { SourceDocument } from '@/lib/sources/types';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

class StaticChatProvider implements ChatProvider {
  messages: ChatProviderMessage[] = [];
  model = 'test-multi-source-model';

  async generateText(messages: readonly ChatProviderMessage[]): Promise<string> {
    this.messages = messages.map((message) => ({ ...message }));

    return 'The handbook defines a 30-day retention window [1], and the repository documents the export command [2].';
  }

  async *streamText(messages: readonly ChatProviderMessage[]): AsyncIterable<string> {
    yield await this.generateText(messages);
  }
}

class DeterministicEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;

  async createEmbedding(): Promise<number[]> {
    return Array.from({ length: expectedEmbeddingDimensions }, (_value, index) =>
      index === 0 ? 1 : 0,
    );
  }
}

function createSourceDocument(input: {
  content: string;
  externalId: string;
  path: string;
  sourceType: 'github' | 'notion';
  title: string;
}): SourceDocument {
  return {
    content: input.content,
    contentHash: hashContent(input.content),
    externalId: input.externalId,
    metadata: {
      path: input.path,
      sourceType: input.sourceType,
    },
    path: input.path,
    title: input.title,
  };
}

describeWithDatabase('multi-source RAG loop', () => {
  let db: Db | null = null;
  let workspaceIndexId: string | null = null;

  beforeEach(() => {
    db = getDb();
  });

  afterEach(async () => {
    if (db && workspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
    }

    db = null;
    workspaceIndexId = null;
  });

  it('ingests different source types and persists one cited answer over both', async () => {
    if (!db) {
      throw new Error('Test database was not initialized.');
    }

    const [workspaceIndex] = await db
      .insert(workspaceIndexes)
      .values({
        description: 'temporary multi-source RAG test',
        name: `Multi-source RAG ${crypto.randomUUID()}`,
      })
      .returning();

    if (!workspaceIndex) {
      throw new Error('Failed to create the test area.');
    }

    workspaceIndexId = workspaceIndex.id;

    const [githubSource, notionSource] = await db
      .insert(workspaceSources)
      .values([
        {
          config: {
            branch: 'main',
            owner: 'example',
            repo: 'knowledge-base',
            repoUrl: 'https://github.com/example/knowledge-base',
          },
          name: 'example/knowledge-base',
          type: 'github',
          workspaceIndexId,
        },
        {
          config: {
            resources: [],
            workspaceName: 'Personal notes',
          },
          name: 'Notion: Personal notes',
          type: 'notion',
          workspaceIndexId,
        },
      ])
      .returning();

    if (!githubSource || !notionSource) {
      throw new Error('Failed to create the test sources.');
    }

    const embeddingProvider = new DeterministicEmbeddingProvider();

    await ingestDocuments({
      db,
      documents: [
        createSourceDocument({
          content: '# Data retention\n\nKeep exported records for 30 days.',
          externalId: 'notion:retention-policy',
          path: 'notion/data-retention.md',
          sourceType: 'notion',
          title: 'Data retention',
        }),
      ],
      embeddingProvider,
      sourceId: notionSource.id,
      sourceType: 'notion',
      workspaceIndexId,
    });
    await ingestDocuments({
      db,
      documents: [
        createSourceDocument({
          content: '# Exporting data\n\nRun `pnpm export:data` to create an archive.',
          externalId: 'github:example/knowledge-base:main:docs/exporting-data.md',
          path: 'docs/exporting-data.md',
          sourceType: 'github',
          title: 'Exporting data',
        }),
      ],
      embeddingProvider,
      sourceId: githubSource.id,
      sourceType: 'github',
      workspaceIndexId,
    });

    const chatProvider = new StaticChatProvider();
    const result = await generateAnswer({
      chatProvider,
      db,
      embeddingProvider,
      question: 'How long are exports retained, and how do I create one?',
      retrievalLimit: 4,
      workspaceIndexId,
    });
    const savedMessages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatSessionId, result.chatSessionId));
    const savedSources = await db
      .select()
      .from(retrievedSources)
      .where(eq(retrievedSources.chatMessageId, result.assistantMessage.id));
    const prompt = chatProvider.messages.map((message) => message.content).join('\n\n');

    expect(result.answer).toContain('[1]');
    expect(result.answer).toContain('[2]');
    expect(result.sources.map((source) => source.sourceType).sort()).toEqual(['github', 'notion']);
    expect(savedMessages).toHaveLength(2);
    expect(savedSources).toHaveLength(2);
    expect(prompt).toContain('Keep exported records for 30 days.');
    expect(prompt).toContain('pnpm export:data');
  });
});
