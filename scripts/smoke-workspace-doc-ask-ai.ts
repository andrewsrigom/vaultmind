import { and, count, eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { createWorkspaceArea } from '@/db/queries/workspace-areas';
import { createWorkspaceDoc } from '@/db/queries/workspace-docs';
import { documents, vaults, workspaceIndexes } from '@/db/schema';
import type { Db } from '@/db';
import type { ChatProvider, ChatProviderMessage } from '@/lib/providers/chat-provider';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import { generateEphemeralAnswer } from '@/lib/rag/generate-answer';
import { setWorkspaceDocAskAiIncluded } from '@/lib/rag/index-workspace-doc';

const workspaceDocSmokeDatabaseUrl = 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';

class StaticWorkspaceDocChatProvider implements ChatProvider {
  model = 'workspace-doc-smoke-chat-model';

  async generateText(_messages: readonly ChatProviderMessage[]): Promise<string> {
    void _messages;

    return 'The internal launch checklist requires rollback owner review before handoff. [1]';
  }

  async *streamText(messages: readonly ChatProviderMessage[]): AsyncIterable<string> {
    yield await this.generateText(messages);
  }
}

class StaticWorkspaceDocEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;

  async createEmbedding(input: string): Promise<number[]> {
    return Array.from({ length: expectedEmbeddingDimensions }, (_value, index) =>
      index === 0 ? input.length : 0,
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createWorkspaceDocSmokeFixture(db: Db) {
  const uniqueId = crypto.randomUUID();
  const [vault] = await db
    .insert(vaults)
    .values({
      description: 'temporary workspace doc Ask AI smoke',
      name: `Workspace Doc Ask AI Smoke ${uniqueId}`,
      slug: `workspace-doc-ask-ai-smoke-${uniqueId}`,
    })
    .returning();

  if (!vault) {
    throw new Error('Failed to create workspace doc smoke vault.');
  }

  const area = await createWorkspaceArea({
    db,
    description: 'Internal docs included in Ask AI.',
    icon: 'book-open',
    name: `Internal Docs ${uniqueId}`,
    vaultId: vault.id,
  });
  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'temporary workspace doc Ask AI smoke index',
      name: 'Workspace Doc Ask AI Smoke KB',
      vaultId: vault.id,
    })
    .returning();

  if (!workspaceIndex) {
    throw new Error('Failed to create workspace doc smoke workspace index.');
  }

  const doc = await createWorkspaceDoc({
    content:
      '# Internal Launch Checklist\n\nRollback owner review is required before agent handoff.',
    db,
    title: 'Internal Launch Checklist',
    vaultId: vault.id,
    workspaceAreaId: area.id,
  });

  if (!doc) {
    throw new Error('Failed to create workspace doc smoke document.');
  }

  return {
    doc,
    vault,
    workspaceIndex,
  };
}

async function countIndexedWorkspaceDoc({
  db,
  docId,
  workspaceIndexId,
}: {
  db: Db;
  docId: string;
  workspaceIndexId: string;
}): Promise<number> {
  const [row] = await db
    .select({ value: count(documents.id) })
    .from(documents)
    .where(
      and(
        eq(documents.externalId, `workspace-doc:${docId}`),
        eq(documents.workspaceIndexId, workspaceIndexId),
      ),
    );

  return row?.value ?? 0;
}

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL?.trim() || workspaceDocSmokeDatabaseUrl;

  const db = getDb();
  const embeddingProvider = new StaticWorkspaceDocEmbeddingProvider();
  const fixture = await createWorkspaceDocSmokeFixture(db);

  try {
    const included = await setWorkspaceDocAskAiIncluded({
      db,
      docId: fixture.doc.id,
      embeddingProvider,
      includeInAskAi: true,
      vaultId: fixture.vault.id,
    });

    if (!included?.doc.includeInAskAi || !included.documentId || !included.sourceId) {
      throw new Error('Workspace doc smoke failed to include the doc in Ask AI.');
    }

    const answer = await generateEphemeralAnswer({
      chatProvider: new StaticWorkspaceDocChatProvider(),
      db,
      embeddingProvider,
      question: 'What does the internal launch checklist require before agent handoff?',
      workspaceIndexId: fixture.workspaceIndex.id,
    });
    const workspaceDocSource = answer.sources.find(
      (source) => source.sourceType === 'workspace-doc',
    );

    if (!workspaceDocSource) {
      throw new Error('Workspace doc smoke expected Ask AI to cite the internal doc source.');
    }

    const removed = await setWorkspaceDocAskAiIncluded({
      db,
      docId: fixture.doc.id,
      includeInAskAi: false,
      vaultId: fixture.vault.id,
    });
    const remainingIndexedDocuments = await countIndexedWorkspaceDoc({
      db,
      docId: fixture.doc.id,
      workspaceIndexId: fixture.workspaceIndex.id,
    });

    if (!removed || removed.doc.includeInAskAi || remainingIndexedDocuments !== 0) {
      throw new Error('Workspace doc smoke failed to remove the doc from Ask AI.');
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          answerSourceType: workspaceDocSource.sourceType,
          includedDocumentId: included.documentId,
          removedDocuments: removed.deletedDocuments,
          sourcePath: workspaceDocSource.path,
          workspaceIndexId: fixture.workspaceIndex.id,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, fixture.workspaceIndex.id));
    await db.delete(vaults).where(eq(vaults.id, fixture.vault.id));
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  process.stderr.write(`Workspace doc Ask AI smoke failed: ${getErrorMessage(error)}\n`);
  process.exit(1);
});
