import { z } from 'zod';

import { withAbortTimeout } from '@/lib/async';
import { SourceAdapterError } from '@/lib/sources/errors';

export type GitHubFetch = typeof fetch;

type GitHubJsonRequestInput = {
  branch?: string;
  fetchFn: GitHubFetch;
  notFoundCode: 'github-branch-not-found' | 'github-repo-not-found';
  timeoutMs?: number;
  token: string;
  url: string;
};

const defaultGitHubTimeoutMs = 20_000;

export const githubBlobResponseSchema = z.object({
  content: z.string(),
  encoding: z.string(),
  sha: z.string(),
  size: z.number().int().nonnegative(),
});

export const githubCommitResponseSchema = z.object({
  sha: z.string(),
});

export const githubTreeFileSchema = z.object({
  path: z.string(),
  sha: z.string(),
  size: z.number().int().nonnegative().optional(),
  type: z.literal('blob'),
});

export const githubTreeResponseSchema = z.object({
  sha: z.string(),
  tree: z.array(
    z
      .object({
        path: z.string().optional(),
        sha: z.string().optional(),
        size: z.number().int().nonnegative().optional(),
        type: z.string().optional(),
      })
      .passthrough(),
  ),
  truncated: z.boolean().optional(),
});

function getGitHubRateLimitRemaining(response: Response): string | null {
  return response.headers.get('x-ratelimit-remaining');
}

function toSafeGitHubError(response: Response, input: GitHubJsonRequestInput): SourceAdapterError {
  const rateLimitRemaining = getGitHubRateLimitRemaining(response);

  if (response.status === 401 || response.status === 403) {
    if (rateLimitRemaining === '0') {
      return new SourceAdapterError(
        'github-rate-limited',
        'GitHub API rate limit was reached. Try again later.',
        429,
      );
    }

    return new SourceAdapterError(
      'github-unauthorized',
      'GitHub rejected the configured token. Check read-only Contents access for this repository.',
      401,
    );
  }

  if (response.status === 404) {
    const isBranchLookup = input.notFoundCode === 'github-branch-not-found';

    return new SourceAdapterError(
      input.notFoundCode,
      isBranchLookup
        ? `GitHub branch "${input.branch ?? 'main'}" was not found.`
        : 'GitHub repository was not found or is not accessible with the configured token.',
      404,
    );
  }

  return new SourceAdapterError(
    'github-fetch-failed',
    'GitHub could not return the requested repository data.',
    502,
  );
}

export async function fetchGitHubJson<TSchema extends z.ZodType>(
  input: GitHubJsonRequestInput,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let response: Response;

  try {
    response = await withAbortTimeout(
      (signal) =>
        input.fetchFn(input.url, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${input.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal,
        }),
      input.timeoutMs ?? defaultGitHubTimeoutMs,
    );
  } catch {
    throw new SourceAdapterError(
      'github-fetch-failed',
      'GitHub could not be reached. Check your network connection and try again.',
      502,
    );
  }

  if (!response.ok) {
    throw toSafeGitHubError(response, input);
  }

  const payload = (await response.json()) as unknown;
  const parsedPayload = schema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new SourceAdapterError(
      'github-fetch-failed',
      'GitHub returned an unexpected response shape.',
      502,
    );
  }

  return parsedPayload.data;
}
