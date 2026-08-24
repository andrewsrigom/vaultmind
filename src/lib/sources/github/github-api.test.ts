import { describe, expect, it } from 'vitest';

import {
  fetchGitHubJson,
  githubCommitResponseSchema,
  type GitHubFetch,
} from '@/lib/sources/github/github-api';

describe('fetchGitHubJson', () => {
  it('passes an abort signal to GitHub fetch calls', async () => {
    let receivedSignal: AbortSignal | null = null;
    const fetchFn: GitHubFetch = async (_input, init) => {
      receivedSignal = init?.signal ?? null;

      return Response.json({ sha: 'commit-sha' });
    };

    await expect(
      fetchGitHubJson(
        {
          fetchFn,
          notFoundCode: 'github-repo-not-found',
          token: 'github-token',
          url: 'https://api.github.com/repos/openai/openai-cookbook/commits/main',
        },
        githubCommitResponseSchema,
      ),
    ).resolves.toEqual({ sha: 'commit-sha' });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});
