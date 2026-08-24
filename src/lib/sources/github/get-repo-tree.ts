import { SourceAdapterError } from '@/lib/sources/errors';
import {
  fetchGitHubJson,
  githubTreeFileSchema,
  githubTreeResponseSchema,
} from '@/lib/sources/github/github-api';

import type { GitHubFetch } from '@/lib/sources/github/github-api';

export type GitHubTreeFile = {
  path: string;
  sha: string;
  size?: number;
};

export type GetRepoTreeInput = {
  commitSha: string;
  fetchFn: GitHubFetch;
  owner: string;
  repo: string;
  token: string;
};

export async function getRepoTree({
  commitSha,
  fetchFn,
  owner,
  repo,
  token,
}: GetRepoTreeInput): Promise<GitHubTreeFile[]> {
  const response = await fetchGitHubJson(
    {
      fetchFn,
      notFoundCode: 'github-repo-not-found',
      token,
      url: `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
    },
    githubTreeResponseSchema,
  );

  if (response.truncated) {
    throw new SourceAdapterError(
      'github-fetch-failed',
      'GitHub repository tree is too large to sync safely with the current limits.',
      413,
    );
  }

  return response.tree.flatMap((entry) => {
    const parsedEntry = githubTreeFileSchema.safeParse(entry);

    if (!parsedEntry.success) {
      return [];
    }

    const { path, sha, size } = parsedEntry.data;

    return size === undefined ? [{ path, sha }] : [{ path, sha, size }];
  });
}
