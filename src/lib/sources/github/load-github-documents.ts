import { Buffer } from 'node:buffer';
import path from 'node:path';

import { mapWithConcurrency } from '@/lib/async';
import { SourceAdapterError } from '@/lib/sources/errors';
import { hashContent } from '@/lib/sources/hash-content';
import { getBranchCommit } from '@/lib/sources/github/get-branch-commit';
import { getFileContent } from '@/lib/sources/github/get-file-content';
import { getRepoTree } from '@/lib/sources/github/get-repo-tree';

import type { GitHubFetch } from '@/lib/sources/github/github-api';
import type { GitHubTreeFile } from '@/lib/sources/github/get-repo-tree';
import type { SourceDocument, SourceSyncResult } from '@/lib/sources/types';
import type { z } from 'zod';
import type { githubSourceConfigSchema } from '@/lib/validators/source';

export type GitHubSourceConfig = z.infer<typeof githubSourceConfigSchema>;

export type LoadGitHubDocumentsInput = {
  config: GitHubSourceConfig;
  fetchFn?: GitHubFetch;
  limits?: {
    maxConcurrentFileDownloads?: number;
    maxFileSizeBytes?: number;
    maxMarkdownFiles?: number;
    maxTotalMarkdownBytes?: number;
  };
  token: string;
};

const defaultFetch: GitHubFetch = fetch;
const markdownExtensions = new Set(['.md', '.mdx']);

export const githubSourceLimits = {
  maxConcurrentFileDownloads: 8,
  maxFileSizeBytes: 500 * 1024,
  maxMarkdownFiles: 500,
  maxTotalMarkdownBytes: 25 * 1024 * 1024,
} as const;

function assertFileWithinSizeLimit(file: GitHubTreeFile, maxFileSizeBytes: number) {
  if (file.size !== undefined && file.size > maxFileSizeBytes) {
    throw new SourceAdapterError(
      'github-markdown-file-too-large',
      `Markdown file "${file.path}" is larger than the current 500 KB sync limit.`,
      413,
    );
  }
}

function extractTitleFromMarkdown(content: string, filePath: string): string {
  const h1Line = content
    .split(/\r?\n/)
    .find((line) => line.startsWith('# ') && line.slice(2).trim().length > 0);

  if (h1Line) {
    return h1Line.slice(2).trim();
  }

  return path.basename(filePath, path.extname(filePath));
}

function getGitHubExternalId(config: GitHubSourceConfig, filePath: string): string {
  return `github:${config.owner}/${config.repo}:${config.branch}:${filePath}`;
}

function getSortedMarkdownFiles(tree: GitHubTreeFile[]): GitHubTreeFile[] {
  return tree
    .filter((file) => markdownExtensions.has(path.extname(file.path).toLowerCase()))
    .sort((left, right) => {
      if (left.path < right.path) {
        return -1;
      }

      if (left.path > right.path) {
        return 1;
      }

      return 0;
    });
}

function matchesPathFilter(filePath: string, filter: string): boolean {
  return filePath === filter || filePath.startsWith(`${filter}/`);
}

function matchesAnyPathFilter(filePath: string, filters: string[]): boolean {
  return filters.some((filter) => matchesPathFilter(filePath, filter));
}

function filterMarkdownFilesByPath(
  markdownFiles: GitHubTreeFile[],
  config: GitHubSourceConfig,
): GitHubTreeFile[] {
  const includePaths = config.includePaths ?? [];
  const excludePaths = config.excludePaths ?? [];

  return markdownFiles.filter((file) => {
    const isIncluded = includePaths.length === 0 || matchesAnyPathFilter(file.path, includePaths);
    const isExcluded = matchesAnyPathFilter(file.path, excludePaths);

    return isIncluded && !isExcluded;
  });
}

function getGitHubDocumentMetadata(
  config: GitHubSourceConfig,
  commitSha: string,
  filePath: string,
): Record<string, unknown> {
  return {
    branch: config.branch,
    commitSha,
    owner: config.owner,
    path: filePath,
    repo: config.repo,
    sourceType: 'github',
  };
}

function assertMarkdownFileCountWithinLimit(markdownFileCount: number, maxMarkdownFiles: number) {
  if (markdownFileCount > maxMarkdownFiles) {
    throw new SourceAdapterError(
      'github-too-many-markdown-files',
      `This repository has ${markdownFileCount} Markdown files. The current sync limit is ${maxMarkdownFiles}.`,
      413,
    );
  }
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function assertMarkdownTotalWithinLimit(totalMarkdownBytes: number, maxTotalMarkdownBytes: number) {
  if (totalMarkdownBytes > maxTotalMarkdownBytes) {
    throw new SourceAdapterError(
      'github-markdown-total-too-large',
      `This repository has more than the current ${formatMegabytes(maxTotalMarkdownBytes)} total Markdown sync limit.`,
      413,
    );
  }
}

function getKnownMarkdownTotalBytes(markdownFiles: GitHubTreeFile[]): number | null {
  if (markdownFiles.some((file) => file.size === undefined)) {
    return null;
  }

  return markdownFiles.reduce((totalBytes, file) => totalBytes + (file.size ?? 0), 0);
}

function normalizeGitHubDocument(
  config: GitHubSourceConfig,
  commitSha: string,
  filePath: string,
  content: string,
): SourceDocument {
  return {
    content,
    contentHash: hashContent(content),
    externalId: getGitHubExternalId(config, filePath),
    metadata: getGitHubDocumentMetadata(config, commitSha, filePath),
    path: filePath,
    title: extractTitleFromMarkdown(content, filePath),
  };
}

export async function loadGitHubDocuments({
  config,
  fetchFn = defaultFetch,
  limits,
  token,
}: LoadGitHubDocumentsInput): Promise<SourceSyncResult> {
  const maxConcurrentFileDownloads =
    limits?.maxConcurrentFileDownloads ?? githubSourceLimits.maxConcurrentFileDownloads;
  const maxFileSizeBytes = limits?.maxFileSizeBytes ?? githubSourceLimits.maxFileSizeBytes;
  const maxMarkdownFiles = limits?.maxMarkdownFiles ?? githubSourceLimits.maxMarkdownFiles;
  const maxTotalMarkdownBytes =
    limits?.maxTotalMarkdownBytes ?? githubSourceLimits.maxTotalMarkdownBytes;
  const commitSha = await getBranchCommit({
    branch: config.branch,
    fetchFn,
    owner: config.owner,
    repo: config.repo,
    token,
  });
  const tree = await getRepoTree({
    commitSha,
    fetchFn,
    owner: config.owner,
    repo: config.repo,
    token,
  });
  const markdownFiles = filterMarkdownFilesByPath(getSortedMarkdownFiles(tree), config);

  if (markdownFiles.length === 0) {
    throw new SourceAdapterError(
      'github-no-markdown-files',
      'No Markdown files were found in this repository branch and path filter.',
      404,
    );
  }

  assertMarkdownFileCountWithinLimit(markdownFiles.length, maxMarkdownFiles);

  const knownMarkdownTotalBytes = getKnownMarkdownTotalBytes(markdownFiles);

  if (knownMarkdownTotalBytes !== null) {
    assertMarkdownTotalWithinLimit(knownMarkdownTotalBytes, maxTotalMarkdownBytes);
  }

  for (const file of markdownFiles) {
    assertFileWithinSizeLimit(file, maxFileSizeBytes);
  }

  const loadedDocuments = await mapWithConcurrency({
    concurrency: maxConcurrentFileDownloads,
    items: markdownFiles,
    mapper: async (file) => {
      const content = await getFileContent({
        fetchFn,
        owner: config.owner,
        repo: config.repo,
        sha: file.sha,
        token,
      });
      const contentSize = Buffer.byteLength(content, 'utf8');

      if (contentSize > maxFileSizeBytes) {
        throw new SourceAdapterError(
          'github-markdown-file-too-large',
          `Markdown file "${file.path}" is larger than the current 500 KB sync limit.`,
          413,
        );
      }

      return {
        contentSize,
        document: normalizeGitHubDocument(config, commitSha, file.path, content),
      };
    },
  });
  const totalContentBytes = loadedDocuments.reduce(
    (totalBytes, loadedDocument) => totalBytes + loadedDocument.contentSize,
    0,
  );

  assertMarkdownTotalWithinLimit(totalContentBytes, maxTotalMarkdownBytes);

  return {
    documents: loadedDocuments.map((loadedDocument) => loadedDocument.document),
    externalVersion: commitSha,
    metadata: {
      branch: config.branch,
      owner: config.owner,
      repo: config.repo,
      sourceType: 'github',
    },
  };
}
