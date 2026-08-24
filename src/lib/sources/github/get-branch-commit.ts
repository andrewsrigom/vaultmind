import { fetchGitHubJson, githubCommitResponseSchema } from '@/lib/sources/github/github-api';

import type { GitHubFetch } from '@/lib/sources/github/github-api';

export type GetBranchCommitInput = {
  branch: string;
  fetchFn: GitHubFetch;
  owner: string;
  repo: string;
  token: string;
};

export async function getBranchCommit({
  branch,
  fetchFn,
  owner,
  repo,
  token,
}: GetBranchCommitInput): Promise<string> {
  const encodedBranch = encodeURIComponent(branch);
  const response = await fetchGitHubJson(
    {
      branch,
      fetchFn,
      notFoundCode: 'github-branch-not-found',
      token,
      url: `https://api.github.com/repos/${owner}/${repo}/commits/${encodedBranch}`,
    },
    githubCommitResponseSchema,
  );

  return response.sha;
}
