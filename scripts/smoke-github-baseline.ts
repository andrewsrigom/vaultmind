import { existsSync, readFileSync } from 'node:fs';

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { workspaceIndexes, workspaceSources } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import { generateEphemeralAnswer } from '@/lib/rag/generate-answer';
import { syncWorkspaceSource } from '@/lib/rag/sync-knowledge-source';
import {
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
} from '@/lib/providers/embedding-provider';
import { parseGitHubRepoUrl } from '@/lib/sources/github/parse-github-url';
import { createGitHubSourceAdapter } from '@/lib/sources/github/github-source-adapter';

import type { Db } from '@/db';
import type { ChatProvider, ChatProviderMessage } from '@/lib/providers/chat-provider';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { GitHubSourceConfig } from '@/lib/sources/github/load-github-documents';

type SmokeSummary = {
  chunksCreated: number;
  documentsCreated: number;
  documentsDeleted: number;
  documentsFound: number;
  documentsUpdated: number;
  skippedUnchanged: number;
};

type SmokeResult = {
  answerCitationVerified: true;
  branchAttempt: number;
  initialSyncCompleted: true;
  repeatSyncHadNoWrites: boolean;
  sourcePathShape: string | null;
  sourceType: string | null;
};

type SmokeBranchAttempt =
  | {
      ok: true;
      result: SmokeResult;
    }
  | {
      ok: false;
    };

const defaultDatabaseUrl = 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';
const defaultRepoUrl = 'https://github.com/openai/openai-node';
const smokeQuestion = 'What does this repository README describe?';

const logger = createLogger('smoke-github-baseline');

class StaticEmbeddingProvider implements EmbeddingProvider {
  dimensions = expectedEmbeddingDimensions;
  model = supportedEmbeddingModel;

  async createEmbedding(): Promise<number[]> {
    return Array.from({ length: expectedEmbeddingDimensions }, (_value, index) =>
      index === 0 ? 1 : 0,
    );
  }
}

class SmokeChatProvider implements ChatProvider {
  messages: ChatProviderMessage[] = [];
  model = 'smoke-chat-model';

  async generateText(messages: readonly ChatProviderMessage[]): Promise<string> {
    this.messages = messages.map((message) => ({ ...message }));

    return 'Smoke answer cites the synced GitHub README. [1]';
  }

  async *streamText(messages: readonly ChatProviderMessage[]): AsyncIterable<string> {
    yield await this.generateText(messages);
  }
}

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function getSafePathShape(path: string | undefined): string | null {
  if (!path) {
    return null;
  }

  const lowercasePath = path.toLowerCase();

  if (lowercasePath.endsWith('.mdx')) {
    return '**/*.mdx';
  }

  return lowercasePath.endsWith('.md') ? '**/*.md' : 'non-markdown-path';
}

function hasNoSyncWrites(summary: SmokeSummary): boolean {
  return (
    summary.documentsCreated === 0 &&
    summary.documentsDeleted === 0 &&
    summary.documentsUpdated === 0
  );
}

function readLocalEnv(): Record<string, string> {
  if (!existsSync('.env')) {
    return {};
  }

  const env: Record<string, string> = {};
  const envFile = readFileSync('.env', 'utf8');

  for (const line of envFile.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmedLine);

    if (!match?.[1] || match[2] === undefined) {
      continue;
    }

    env[match[1]] = match[2].replace(/^["']|["']$/gu, '');
  }

  return env;
}

function loadLocalEnv() {
  const localEnv = readLocalEnv();

  for (const [key, value] of Object.entries(localEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readCommaSeparatedEnv(key: string, fallback: string[]): string[] {
  const value = process.env[key];

  if (!value) {
    return fallback;
  }

  const values = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return values.length > 0 ? [...new Set(values)] : fallback;
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required for the GitHub baseline smoke.`);
  }

  return value;
}

function createSourceConfig(branch: string): GitHubSourceConfig {
  const repoUrl = process.env.SMOKE_GITHUB_REPO_URL?.trim() || defaultRepoUrl;
  const parsedRepo = parseGitHubRepoUrl(repoUrl);

  return {
    branch,
    excludePaths: readCommaSeparatedEnv('SMOKE_GITHUB_EXCLUDE_PATHS', []),
    includePaths: readCommaSeparatedEnv('SMOKE_GITHUB_INCLUDE_PATHS', ['README.md']),
    owner: parsedRepo.owner,
    repo: parsedRepo.repo,
    repoUrl: parsedRepo.repoUrl,
  };
}

async function trySyncBranch({
  branch,
  branchAttempt,
  db,
  workspaceIndexId,
}: {
  branch: string;
  branchAttempt: number;
  db: Db;
  workspaceIndexId: string;
}): Promise<SmokeBranchAttempt> {
  const sourceConfig = createSourceConfig(branch);
  const [source] = await db
    .insert(workspaceSources)
    .values({
      config: sourceConfig,
      name: `${sourceConfig.owner}/${sourceConfig.repo} ${branch}`,
      type: 'github',
      workspaceIndexId,
    })
    .returning();

  if (!source) {
    throw new Error('Failed to create smoke GitHub source.');
  }

  try {
    await syncWorkspaceSource({
      adapterRegistry: () => createGitHubSourceAdapter(),
      db,
      embeddingProvider: new StaticEmbeddingProvider(),
      sourceId: source.id,
      workspaceIndexId,
    });
    const repeatSyncResult = await syncWorkspaceSource({
      adapterRegistry: () => createGitHubSourceAdapter(),
      db,
      embeddingProvider: new StaticEmbeddingProvider(),
      sourceId: source.id,
      workspaceIndexId,
    });
    const answer = await generateEphemeralAnswer({
      chatProvider: new SmokeChatProvider(),
      db,
      embeddingProvider: new StaticEmbeddingProvider(),
      question: smokeQuestion,
      workspaceIndexId,
    });

    const sourceReference = answer.sources.find((candidate) => candidate.sourceType === 'github');

    if (!sourceReference) {
      throw new Error('Ask AI smoke did not cite the synced GitHub source.');
    }

    return {
      ok: true,
      result: {
        answerCitationVerified: true,
        branchAttempt,
        initialSyncCompleted: true,
        repeatSyncHadNoWrites: hasNoSyncWrites(repeatSyncResult.summary),
        sourcePathShape: getSafePathShape(sourceReference.path),
        sourceType: sourceReference.sourceType,
      },
    };
  } catch (error: unknown) {
    await db.delete(workspaceSources).where(eq(workspaceSources.id, source.id));

    logger.error('GitHub baseline branch attempt failed.', error, {
      attempt: branchAttempt,
      operation: 'smoke-github-baseline',
    });

    return {
      ok: false,
    };
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  process.env.DATABASE_URL = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;
  requireEnv('GITHUB_TOKEN');

  const db = getDb();
  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'temporary GitHub baseline smoke',
      name: `GitHub Baseline Smoke ${Date.now()}`,
    })
    .returning();

  if (!workspaceIndex) {
    throw new Error('Failed to create smoke workspace index.');
  }

  try {
    const branches = readCommaSeparatedEnv('SMOKE_GITHUB_BRANCHES', ['master', 'main']);

    for (const [branchIndex, branch] of branches.entries()) {
      const attempt = await trySyncBranch({
        branch,
        branchAttempt: branchIndex + 1,
        db,
        workspaceIndexId: workspaceIndex.id,
      });

      if (attempt.ok) {
        writeLine(JSON.stringify(attempt.result, null, 2));
        return;
      }
    }

    throw new Error('GitHub baseline smoke failed for every configured branch.');
  } finally {
    await db.delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndex.id));
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error('GitHub baseline smoke failed.', error, {
      operation: 'smoke-github-baseline',
    });
    writeLine('FAIL github-baseline-smoke-failed');
    process.exit(1);
  });
