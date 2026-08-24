import { Buffer } from 'node:buffer';

import { SourceAdapterError } from '@/lib/sources/errors';
import { fetchGitHubJson, githubBlobResponseSchema } from '@/lib/sources/github/github-api';

import type { GitHubFetch } from '@/lib/sources/github/github-api';

export type GetFileContentInput = {
  fetchFn: GitHubFetch;
  owner: string;
  repo: string;
  sha: string;
  token: string;
};

export async function getFileContent({
  fetchFn,
  owner,
  repo,
  sha,
  token,
}: GetFileContentInput): Promise<string> {
  const response = await fetchGitHubJson(
    {
      fetchFn,
      notFoundCode: 'github-repo-not-found',
      token,
      url: `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`,
    },
    githubBlobResponseSchema,
  );

  if (response.encoding !== 'base64') {
    throw new SourceAdapterError(
      'github-fetch-failed',
      'GitHub returned file content in an unsupported encoding.',
      502,
    );
  }

  return Buffer.from(response.content, 'base64').toString('utf8');
}
