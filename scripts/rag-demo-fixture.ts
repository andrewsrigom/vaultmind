import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { getOrCreateWorkspaceAreaHomeDoc } from '@/db/queries/workspace-docs';
import { upsertWorkspaceArea } from '@/db/queries/workspace-areas';
import {
  chatMessages,
  documents,
  retrievedSources,
  vaults,
  workspaceAreas,
  workspaceIndexes,
  workspaceSources,
} from '@/db/schema';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { generateAnswer } from '@/lib/rag/generate-answer';
import { ingestDocuments } from '@/lib/rag/ingest-documents';
import { hashContent } from '@/lib/sources/hash-content';

import type { Db } from '@/db';
import type { ChatProvider } from '@/lib/providers/chat-provider';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { SourceDocument } from '@/lib/sources/types';

export const ragDemoVaultId = '00000000-0000-4000-8000-00000000d001';
export const ragDemoWorkspaceIndexId = '00000000-0000-4000-8000-00000000d002';

class DemoEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;

  async createEmbedding(): Promise<number[]> {
    return Array.from({ length: expectedEmbeddingDimensions }, (_value, index) =>
      index === 0 ? 1 : 0,
    );
  }
}

class DemoChatProvider implements ChatProvider {
  model = 'vaultmind-demo';

  async generateText(): Promise<string> {
    return [
      'Start VaultMind with `pnpm db:up` and `pnpm dev`. [1]',
      'The research notes recommend keeping answers tied to their original sources. [2]',
      'The review checklist asks you to verify citations before sharing an answer. [3]',
    ].join('\n\n');
  }

  async *streamText(): AsyncIterable<string> {
    yield await this.generateText();
  }
}

function createSourceDocument(input: {
  content: string;
  externalId: string;
  path: string;
  sourceType: 'github' | 'google-drive' | 'notion';
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

async function resetDemoData(db: Db) {
  await db.delete(workspaceAreas).where(eq(workspaceAreas.vaultId, ragDemoVaultId));
  await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, ragDemoWorkspaceIndexId));

  await db
    .insert(vaults)
    .values({
      description: 'A local multi-source RAG demo with synthetic documents.',
      id: ragDemoVaultId,
      name: 'VaultMind Demo',
      slug: 'vaultmind-demo',
    })
    .onConflictDoUpdate({
      set: {
        description: 'A local multi-source RAG demo with synthetic documents.',
        name: 'VaultMind Demo',
        slug: 'vaultmind-demo',
        updatedAt: new Date(),
      },
      target: vaults.id,
    });
}

export async function seedRagDemo() {
  const db = getDb();

  await resetDemoData(db);

  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'Synthetic GitHub, Notion, and Google Drive context for the local demo.',
      id: ragDemoWorkspaceIndexId,
      name: 'Demo knowledge',
      vaultId: ragDemoVaultId,
    })
    .returning();

  if (!workspaceIndex) {
    throw new Error('Failed to create the demo knowledge index.');
  }

  const [githubSource, notionSource, googleDriveSource] = await db
    .insert(workspaceSources)
    .values([
      {
        config: {
          branch: 'main',
          owner: 'example',
          repo: 'vaultmind-demo',
          repoUrl: 'https://github.com/example/vaultmind-demo',
        },
        name: 'example/vaultmind-demo',
        type: 'github',
        workspaceIndexId: workspaceIndex.id,
      },
      {
        config: {
          resources: [],
          workspaceName: 'Research notes',
        },
        name: 'Notion: Research notes',
        type: 'notion',
        workspaceIndexId: workspaceIndex.id,
      },
      {
        config: {
          resources: [],
        },
        name: 'Google Drive: Review checklist',
        type: 'google-drive',
        workspaceIndexId: workspaceIndex.id,
      },
    ])
    .returning();

  if (!githubSource || !notionSource || !googleDriveSource) {
    throw new Error('Failed to create all demo sources.');
  }

  const embeddingProvider = new DemoEmbeddingProvider();

  await ingestDocuments({
    db,
    documents: [
      createSourceDocument({
        content: '# Local setup\n\nRun `pnpm db:up` and then `pnpm dev` to start VaultMind.',
        externalId: 'github:example/vaultmind-demo:main:docs/local-setup.md',
        path: 'docs/local-setup.md',
        sourceType: 'github',
        title: 'Local setup',
      }),
    ],
    embeddingProvider,
    sourceId: githubSource.id,
    sourceType: 'github',
    workspaceIndexId: workspaceIndex.id,
  });
  await ingestDocuments({
    db,
    documents: [
      createSourceDocument({
        content:
          '# Research notes\n\nKeep every generated answer tied to its original sources and preserve citation links.',
        externalId: 'notion:research-notes',
        path: 'notion/research-notes.md',
        sourceType: 'notion',
        title: 'Research notes',
      }),
    ],
    embeddingProvider,
    sourceId: notionSource.id,
    sourceType: 'notion',
    workspaceIndexId: workspaceIndex.id,
  });
  await ingestDocuments({
    db,
    documents: [
      createSourceDocument({
        content:
          '# Review checklist\n\nBefore sharing an answer, verify that each important claim has a matching citation.',
        externalId: 'google-drive:review-checklist',
        path: 'google-drive/review-checklist.md',
        sourceType: 'google-drive',
        title: 'Review checklist',
      }),
    ],
    embeddingProvider,
    sourceId: googleDriveSource.id,
    sourceType: 'google-drive',
    workspaceIndexId: workspaceIndex.id,
  });

  const indexedDocuments = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.workspaceIndexId, workspaceIndex.id));
  const area = await upsertWorkspaceArea({
    db,
    description: 'Setup notes, research, and review guidance from three source types.',
    documentLinks: indexedDocuments.map((document) => ({
      confidence: 1,
      documentId: document.id,
      reason: 'Included in the local multi-source RAG demo.',
    })),
    icon: 'book-open',
    name: 'Demo knowledge',
    origin: 'seeded',
    reason: 'Created by the deterministic demo seed.',
    vaultId: ragDemoVaultId,
  });

  await getOrCreateWorkspaceAreaHomeDoc({
    db,
    vaultId: ragDemoVaultId,
    workspaceAreaId: area.id,
  });

  const answer = await generateAnswer({
    chatProvider: new DemoChatProvider(),
    db,
    embeddingProvider,
    question: 'How do I run VaultMind, and what should I check before sharing an answer?',
    retrievalLimit: 6,
    workspaceIndexId: workspaceIndex.id,
  });
  const savedMessages = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.chatSessionId, answer.chatSessionId));
  const savedSources = await db
    .select({ id: retrievedSources.id })
    .from(retrievedSources)
    .where(eq(retrievedSources.chatMessageId, answer.assistantMessage.id));

  return {
    answer: answer.answer,
    askPath: `/vault/vaultmind-demo/ask?chatSessionId=${answer.chatSessionId}`,
    chatSessionId: answer.chatSessionId,
    messageCount: savedMessages.length,
    sourceCount: savedSources.length,
    sourceTypes: answer.sources.map((source) => source.sourceType).sort(),
    vaultId: ragDemoVaultId,
    vaultSlug: 'vaultmind-demo',
    workspaceAreaId: area.id,
    workspaceIndexId: workspaceIndex.id,
  };
}
