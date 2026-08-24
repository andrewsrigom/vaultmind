import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { SourceAdapterError } from '@/lib/sources/errors';
import { hashContent } from '@/lib/sources/hash-content';
import { createGitHubSourceAdapter } from '@/lib/sources/github/github-source-adapter';
import { loadGitHubDocuments } from '@/lib/sources/github/load-github-documents';

import type { GitHubFetch } from '@/lib/sources/github/github-api';
import type { GitHubSourceConfig } from '@/lib/sources/github/load-github-documents';

type MockRoute = {
  body: unknown;
  headers?: HeadersInit;
  status?: number;
};

const config = {
  branch: 'main',
  excludePaths: [],
  includePaths: [],
  owner: 'openai',
  repo: 'openai-cookbook',
  repoUrl: 'https://github.com/openai/openai-cookbook',
} satisfies GitHubSourceConfig;

const commitUrl = 'https://api.github.com/repos/openai/openai-cookbook/commits/main';
const treeUrl =
  'https://api.github.com/repos/openai/openai-cookbook/git/trees/commit-sha?recursive=1';

function createBlob(content: string, sha: string) {
  return {
    content: Buffer.from(content, 'utf8').toString('base64'),
    encoding: 'base64',
    sha,
    size: Buffer.byteLength(content, 'utf8'),
  };
}

function createMockFetch(routes: Record<string, MockRoute>) {
  const calls: string[] = [];
  const fetchFn: GitHubFetch = async (input) => {
    const url = input.toString();
    const route = routes[url];

    calls.push(url);

    if (!route) {
      return Response.json({ message: 'Not found' }, { status: 404 });
    }

    return Response.json(route.body, {
      ...(route.headers ? { headers: route.headers } : {}),
      status: route.status ?? 200,
    });
  };

  return {
    calls,
    fetchFn,
  };
}

function expectSourceAdapterError(error: unknown, code: SourceAdapterError['code']) {
  expect(error).toBeInstanceOf(SourceAdapterError);

  if (error instanceof SourceAdapterError) {
    expect(error.code).toBe(code);
    return;
  }

  throw new Error('Expected SourceAdapterError.');
}

async function expectLoadError(
  fetchFn: GitHubFetch,
  code: SourceAdapterError['code'],
  limits?: {
    maxFileSizeBytes?: number;
    maxMarkdownFiles?: number;
    maxTotalMarkdownBytes?: number;
  },
) {
  try {
    await loadGitHubDocuments({
      config,
      ...(limits ? { limits } : {}),
      fetchFn,
      token: 'github-token',
    });
  } catch (error: unknown) {
    expectSourceAdapterError(error, code);
    return;
  }

  throw new Error('Expected loadGitHubDocuments to throw.');
}

describe('loadGitHubDocuments', () => {
  it('loads and normalizes Markdown files from GitHub API responses', async () => {
    const readmeContent = '# README\n\nProject notes.';
    const nestedContent = 'No heading here.';
    const readmeUrl = 'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-readme';
    const nestedUrl = 'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-nested';
    const { fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [nestedUrl]: {
        body: createBlob(nestedContent, 'blob-nested'),
      },
      [readmeUrl]: {
        body: createBlob(readmeContent, 'blob-readme'),
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'image.png',
              sha: 'blob-image',
              type: 'blob',
            },
            {
              path: 'README.md',
              sha: 'blob-readme',
              size: Buffer.byteLength(readmeContent, 'utf8'),
              type: 'blob',
            },
            {
              path: 'notes/nested.mdx',
              sha: 'blob-nested',
              size: Buffer.byteLength(nestedContent, 'utf8'),
              type: 'blob',
            },
          ],
          truncated: false,
        },
      },
    });

    await expect(
      loadGitHubDocuments({
        config,
        fetchFn,
        token: 'github-token',
      }),
    ).resolves.toEqual({
      documents: [
        {
          content: readmeContent,
          contentHash: hashContent(readmeContent),
          externalId: 'github:openai/openai-cookbook:main:README.md',
          metadata: {
            branch: 'main',
            commitSha: 'commit-sha',
            owner: 'openai',
            path: 'README.md',
            repo: 'openai-cookbook',
            sourceType: 'github',
          },
          path: 'README.md',
          title: 'README',
        },
        {
          content: nestedContent,
          contentHash: hashContent(nestedContent),
          externalId: 'github:openai/openai-cookbook:main:notes/nested.mdx',
          metadata: {
            branch: 'main',
            commitSha: 'commit-sha',
            owner: 'openai',
            path: 'notes/nested.mdx',
            repo: 'openai-cookbook',
            sourceType: 'github',
          },
          path: 'notes/nested.mdx',
          title: 'nested',
        },
      ],
      externalVersion: 'commit-sha',
      metadata: {
        branch: 'main',
        owner: 'openai',
        repo: 'openai-cookbook',
        sourceType: 'github',
      },
    });
  });

  it('limits concurrent Markdown blob downloads while preserving document order', async () => {
    let activeBlobDownloads = 0;
    let maxActiveBlobDownloads = 0;
    const blobUrls = [
      'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-a',
      'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-b',
      'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-c',
      'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-d',
    ];
    const routes: Record<string, MockRoute> = {
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'a.md',
              sha: 'blob-a',
              size: 10,
              type: 'blob',
            },
            {
              path: 'b.md',
              sha: 'blob-b',
              size: 10,
              type: 'blob',
            },
            {
              path: 'c.md',
              sha: 'blob-c',
              size: 10,
              type: 'blob',
            },
            {
              path: 'd.md',
              sha: 'blob-d',
              size: 10,
              type: 'blob',
            },
          ],
        },
      },
    };

    for (const [index, blobUrl] of blobUrls.entries()) {
      routes[blobUrl] = {
        body: createBlob(`# File ${index + 1}`, `blob-${index + 1}`),
      };
    }

    const fetchFn: GitHubFetch = async (input) => {
      const url = input.toString();
      const route = routes[url];

      if (!route) {
        return Response.json({ message: 'Not found' }, { status: 404 });
      }

      if (blobUrls.includes(url)) {
        activeBlobDownloads += 1;
        maxActiveBlobDownloads = Math.max(maxActiveBlobDownloads, activeBlobDownloads);
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
        activeBlobDownloads -= 1;
      }

      return Response.json(route.body, {
        ...(route.headers ? { headers: route.headers } : {}),
        status: route.status ?? 200,
      });
    };

    const result = await loadGitHubDocuments({
      config,
      fetchFn,
      limits: {
        maxConcurrentFileDownloads: 2,
      },
      token: 'github-token',
    });

    expect(maxActiveBlobDownloads).toBeLessThanOrEqual(2);
    expect(result.documents.map((document) => document.path)).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'd.md',
    ]);
  });

  it('applies include and exclude path filters before enforcing limits or downloading blobs', async () => {
    const includedUrl =
      'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-include';
    const { calls, fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [includedUrl]: {
        body: createBlob('# Included', 'blob-include'),
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'docs/include.md',
              sha: 'blob-include',
              size: 10,
              type: 'blob',
            },
            {
              path: 'docs/archive/skip.md',
              sha: 'blob-skip',
              size: 10,
              type: 'blob',
            },
            {
              path: 'notes/outside.md',
              sha: 'blob-outside',
              size: 10,
              type: 'blob',
            },
          ],
        },
      },
    });

    const result = await loadGitHubDocuments({
      config: {
        ...config,
        excludePaths: ['docs/archive'],
        includePaths: ['docs'],
      },
      fetchFn,
      limits: {
        maxMarkdownFiles: 1,
      },
      token: 'github-token',
    });

    expect(result.documents.map((document) => document.path)).toEqual(['docs/include.md']);
    expect(calls).toEqual([commitUrl, treeUrl, includedUrl]);
  });

  it('fails before downloading blobs when too many Markdown files are present', async () => {
    const { calls, fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'one.md',
              sha: 'blob-one',
              size: 10,
              type: 'blob',
            },
            {
              path: 'two.md',
              sha: 'blob-two',
              size: 10,
              type: 'blob',
            },
          ],
        },
      },
    });

    await expectLoadError(fetchFn, 'github-too-many-markdown-files', {
      maxMarkdownFiles: 1,
    });
    expect(calls).toEqual([commitUrl, treeUrl]);
  });

  it('fails before downloading blobs when a Markdown file is too large', async () => {
    const { calls, fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'large.md',
              sha: 'blob-large',
              size: 501,
              type: 'blob',
            },
          ],
        },
      },
    });

    await expectLoadError(fetchFn, 'github-markdown-file-too-large', {
      maxFileSizeBytes: 500,
    });
    expect(calls).toEqual([commitUrl, treeUrl]);
  });

  it('fails before downloading blobs when total Markdown tree size is too large', async () => {
    const { calls, fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'one.md',
              sha: 'blob-one',
              size: 60,
              type: 'blob',
            },
            {
              path: 'two.md',
              sha: 'blob-two',
              size: 50,
              type: 'blob',
            },
          ],
        },
      },
    });

    await expectLoadError(fetchFn, 'github-markdown-total-too-large', {
      maxTotalMarkdownBytes: 100,
    });
    expect(calls).toEqual([commitUrl, treeUrl]);
  });

  it('fails before embedding when downloaded Markdown content exceeds the total limit', async () => {
    const oneUrl = 'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-one';
    const twoUrl = 'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-two';
    const { fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [oneUrl]: {
        body: createBlob('One content.', 'blob-one'),
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'one.md',
              sha: 'blob-one',
              type: 'blob',
            },
            {
              path: 'two.md',
              sha: 'blob-two',
              type: 'blob',
            },
          ],
        },
      },
      [twoUrl]: {
        body: createBlob('Two content.', 'blob-two'),
      },
    });

    await expectLoadError(fetchFn, 'github-markdown-total-too-large', {
      maxTotalMarkdownBytes: 20,
    });
  });

  it('returns a useful error when no Markdown files exist', async () => {
    const { fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'image.png',
              sha: 'blob-image',
              type: 'blob',
            },
          ],
        },
      },
    });

    await expectLoadError(fetchFn, 'github-no-markdown-files');
  });

  it('maps missing branch responses to github-branch-not-found', async () => {
    const { fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          message: 'Not found',
        },
        status: 404,
      },
    });

    await expectLoadError(fetchFn, 'github-branch-not-found');
  });

  it('maps unauthorized GitHub responses without exposing raw provider details', async () => {
    const { fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          message: 'Bad credentials',
        },
        status: 401,
      },
    });

    await expectLoadError(fetchFn, 'github-unauthorized');
  });
});

describe('createGitHubSourceAdapter', () => {
  it('uses an OAuth credential from source context when present', async () => {
    const readmeContent = '# README\n\nOAuth-backed project notes.';
    const readmeUrl = 'https://api.github.com/repos/openai/openai-cookbook/git/blobs/blob-readme';
    const { fetchFn } = createMockFetch({
      [commitUrl]: {
        body: {
          sha: 'commit-sha',
        },
      },
      [readmeUrl]: {
        body: createBlob(readmeContent, 'blob-readme'),
      },
      [treeUrl]: {
        body: {
          sha: 'commit-sha',
          tree: [
            {
              path: 'README.md',
              sha: 'blob-readme',
              size: Buffer.byteLength(readmeContent, 'utf8'),
              type: 'blob',
            },
          ],
          truncated: false,
        },
      },
    });
    const adapter = createGitHubSourceAdapter({ fetchFn });
    const result = await adapter.loadDocuments(config, {
      credential: {
        accessToken: 'oauth-token',
        expiresAt: null,
        refreshToken: null,
      },
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.externalId).toBe('github:openai/openai-cookbook:main:README.md');
  });

  it('rejects unsupported repository hosts in source config', async () => {
    const adapter = createGitHubSourceAdapter({ token: 'github-token' });

    try {
      await adapter.loadDocuments({
        branch: 'main',
        excludePaths: [],
        includePaths: [],
        owner: 'openai',
        repo: 'openai-cookbook',
        repoUrl: 'https://gitlab.com/openai/openai-cookbook',
      });
    } catch (error: unknown) {
      expectSourceAdapterError(error, 'unsupported-github-host');
      return;
    }

    throw new Error('Expected adapter to reject unsupported hosts.');
  });

  it('requires a server-side token before loading documents', async () => {
    const adapter = createGitHubSourceAdapter({ token: '' });

    try {
      await adapter.loadDocuments(config);
    } catch (error: unknown) {
      expectSourceAdapterError(error, 'github-token-missing');
      return;
    }

    throw new Error('Expected adapter to require a token.');
  });
});
