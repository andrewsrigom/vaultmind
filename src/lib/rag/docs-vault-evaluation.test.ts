import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { workspaceIndexes, workspaceSources } from '@/db/schema';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { ingestDocuments } from '@/lib/rag/ingest-documents';
import { defaultRetrievalLimit, searchRelevantChunks } from '@/lib/rag/search-relevant-chunks';
import { hashContent } from '@/lib/sources/hash-content';

import { eq } from 'drizzle-orm';

import type { Db } from '@/db';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { SourceDocument } from '@/lib/sources/types';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const docsVaultFixtures = {
  'Architecture.md': `# Architecture

The architecture separates source adapters from the RAG pipeline.
Source adapters normalize documents, the RAG pipeline chunks and embeds them, and UI components stay separate from provider logic.`,
  'GitHub Source Adapter.md': `# GitHub Source Adapter

The GitHub source adapter uses the GitHub API to load Markdown files safely.
It enforces sync limits, returns SourceDocument values, and avoids storing GitHub tokens in source configuration.`,
  'Local Security Model.md': `# Local Security Model

The local security model keeps private Markdown content in the local database.
GitHub token values and provider keys are server-only environment variables and must not appear in logs or browser bundles.`,
  'Local Setup.md': `# Local Setup

Local setup uses Docker for PostgreSQL and pgvector, environment variables in .env, and localhost services.
Developers configure database credentials, GitHub and OpenAI keys, then run the local app against the database.`,
  'Overview.md': `# Overview

VaultMind is a private Markdown knowledge assistant for safe reference over a workspace.
It keeps product documentation searchable while preserving a controlled deployment boundary.
This overview explains VaultMind, private workspace behavior, Markdown knowledge, and cited answers.`,
  'RAG Pipeline.md': `# RAG Pipeline

The RAG pipeline embeds the query, searches chunks with cosine distance, and builds context for answer generation.
When retrieved context is not enough, the assistant must say the workspace does not contain enough information.`,
  'Roadmap.md': `# Roadmap

The roadmap includes future source adapters for Notion, Google Drive, Confluence, and other systems.
VaultMind can later support Tauri and additional source adapters without changing the core retrieval contract.`,
} as const;

const retrievalEvaluationCases = [
  {
    expectedPaths: ['Overview.md'],
    question: 'What is VaultMind and how does it keep knowledge private?',
  },
  {
    expectedPaths: ['Local Setup.md'],
    question: 'How do I run VaultMind locally with Docker and environment variables?',
  },
  {
    expectedPaths: ['Architecture.md'],
    question: 'How are source adapters separated from the RAG pipeline?',
  },
  {
    expectedPaths: ['RAG Pipeline.md'],
    question: 'What happens when retrieved context is not enough to answer?',
  },
  {
    expectedPaths: ['GitHub Source Adapter.md'],
    question: 'How does the GitHub source adapter sync Markdown files safely?',
  },
  {
    expectedPaths: ['Local Security Model.md'],
    question: 'Where are private Markdown content and GitHub tokens stored?',
  },
  {
    expectedPaths: ['Roadmap.md'],
    question: 'What source adapters could VaultMind support in the future?',
  },
] as const;

const embeddingCategories = [
  {
    index: 0,
    keywords: ['vaultmind', 'private workspace', 'markdown knowledge', 'safe reference'],
  },
  {
    index: 1,
    keywords: ['local setup', 'docker', 'environment variables', 'database', 'localhost'],
  },
  {
    index: 2,
    keywords: ['architecture', 'source adapters', 'rag pipeline', 'ui components'],
  },
  {
    index: 3,
    keywords: ['retrieved context', 'not enough', 'embeds the query', 'cosine distance'],
  },
  {
    index: 4,
    keywords: ['github source adapter', 'github api', 'sync limits', 'source document'],
  },
  {
    index: 5,
    keywords: ['local security', 'private markdown', 'github token', 'server-only'],
  },
  {
    index: 6,
    keywords: ['roadmap', 'future source', 'notion', 'google drive', 'tauri'],
  },
] as const;

class DocsVaultEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;

  async createEmbedding(input: string): Promise<number[]> {
    const normalizedInput = input.toLowerCase();
    const vector = Array.from({ length: expectedEmbeddingDimensions }, () => 0);

    vector[expectedEmbeddingDimensions - 1] = 0.01;

    for (const category of embeddingCategories) {
      const score = category.keywords.reduce(
        (total, keyword) => total + (normalizedInput.includes(keyword) ? 1 : 0),
        0,
      );

      vector[category.index] = score;
    }

    return vector;
  }
}

function readDocsVaultDocuments(): SourceDocument[] {
  return Object.entries(docsVaultFixtures).map(([fileName, content]) => {
    const title = fileName.replace(/\.md$/u, '');

    return {
      content,
      contentHash: hashContent(content),
      externalId: `vaultmind-docs-vault:${fileName}`,
      metadata: {
        fixture: 'vaultmind-docs-vault',
        path: fileName,
      },
      path: fileName,
      title,
    };
  });
}

async function createDocsVaultWorkspaceIndex(db: Db) {
  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'database-backed docs vault evaluation',
      name: 'Docs Vault Evaluation KB',
    })
    .returning();

  if (!workspaceIndex) {
    throw new Error('Failed to create docs-vault evaluation workspace index.');
  }

  const [source] = await db
    .insert(workspaceSources)
    .values({
      config: {
        branch: 'main',
        owner: 'andrewsrigom',
        repo: 'vaultmind-docs-vault',
        repoUrl: 'https://github.com/andrewsrigom/vaultmind-docs-vault',
      },
      name: 'andrewsrigom/vaultmind-docs-vault',
      type: 'github',
      workspaceIndexId: workspaceIndex.id,
    })
    .returning();

  if (!source) {
    throw new Error('Failed to create docs-vault evaluation source.');
  }

  return {
    source,
    workspaceIndex,
  };
}

describeWithDatabase('VaultMind docs vault retrieval evaluation', () => {
  let db: Db | null = null;
  let workspaceIndexId: string | null = null;

  beforeEach(async () => {
    db = getDb();

    const docsVault = await createDocsVaultWorkspaceIndex(db);
    workspaceIndexId = docsVault.workspaceIndex.id;

    await ingestDocuments({
      db,
      documents: readDocsVaultDocuments(),
      embeddingProvider: new DocsVaultEmbeddingProvider(),
      sourceId: docsVault.source.id,
      sourceType: 'github',
      workspaceIndexId: docsVault.workspaceIndex.id,
    });
  });

  afterEach(async () => {
    if (db && workspaceIndexId) {
      await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
    }

    db = null;
    workspaceIndexId = null;
  });

  it.each(retrievalEvaluationCases)(
    'retrieves expected docs-vault source files for "$question"',
    async ({ expectedPaths, question }) => {
      if (!db || !workspaceIndexId) {
        throw new Error('Docs-vault evaluation database was not initialized.');
      }

      const results = await searchRelevantChunks({
        db,
        embeddingProvider: new DocsVaultEmbeddingProvider(),
        query: question,
        workspaceIndexId,
      });
      const resultPaths = results.map((result) => result.path);

      expect(results.length).toBeLessThanOrEqual(defaultRetrievalLimit);

      for (const expectedPath of expectedPaths) {
        expect(resultPaths).toContain(expectedPath);
      }
    },
  );
});
