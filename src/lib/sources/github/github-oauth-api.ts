import { z } from 'zod';

import { withAbortTimeout } from '@/lib/async';
import { SourceAdapterError } from '@/lib/sources/errors';

import type { SourceSelectableResource } from '@/lib/sources/types';

export type GitHubOAuthFetch = typeof fetch;

export type GitHubOAuthToken = {
  accessToken: string;
  expiresAt: Date | null;
  scopes: string[];
};

export type GitHubAuthenticatedUser = {
  accountId: string;
  login: string;
};

export type GitHubRepositoryResource = SourceSelectableResource & {
  defaultBranch: string;
  fullName: string;
  owner: string;
  private: boolean;
  repo: string;
};

const defaultFetch: GitHubOAuthFetch = fetch;
const defaultGitHubOAuthTimeoutMs = 20_000;
const githubApiBaseUrl = 'https://api.github.com';
const githubOAuthTokenUrl = 'https://github.com/login/oauth/access_token';

export const githubOAuthReadScopes = ['repo', 'read:user'] as const;

const githubOAuthTokenResponseSchema = z
  .object({
    access_token: z.string().trim().min(1).optional(),
    error: z.string().optional(),
    expires_in: z.number().optional(),
    scope: z.string().optional(),
  })
  .passthrough();

const githubAuthenticatedUserSchema = z
  .object({
    id: z.number().int(),
    login: z.string().trim().min(1),
  })
  .passthrough();

const githubRepositorySchema = z
  .object({
    default_branch: z.string().trim().min(1).nullable().optional(),
    full_name: z.string().trim().min(1),
    html_url: z.string().trim().url().optional(),
    id: z.number().int(),
    name: z.string().trim().min(1),
    owner: z
      .object({
        login: z.string().trim().min(1),
      })
      .passthrough(),
    private: z.boolean(),
    updated_at: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough();

const githubRepositoryListSchema = z.array(githubRepositorySchema);

function getGitHubOAuthError(status: number, response?: Response): SourceAdapterError {
  if (status === 401 || status === 403) {
    if (response?.headers.get('x-ratelimit-remaining') === '0') {
      return new SourceAdapterError(
        'github-rate-limited',
        'GitHub API rate limit was reached. Try again later.',
        429,
      );
    }

    return new SourceAdapterError(
      'github-unauthorized',
      'GitHub rejected this connection. Reconnect GitHub and try again.',
      401,
    );
  }

  if (status === 429) {
    return new SourceAdapterError(
      'github-rate-limited',
      'GitHub API rate limit was reached. Try again later.',
      429,
    );
  }

  return new SourceAdapterError(
    'github-fetch-failed',
    'GitHub could not return the requested data.',
    status >= 500 ? 502 : 400,
  );
}

function parseScopes(scope: string | undefined): string[] {
  return (scope ?? '')
    .split(/[,\s]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function fetchGitHubOAuthJson<TSchema extends z.ZodType>(input: {
  accessToken: string;
  fetchFn?: GitHubOAuthFetch;
  schema: TSchema;
  timeoutMs?: number;
  url: URL;
}): Promise<z.infer<TSchema>> {
  const fetchFn = input.fetchFn ?? defaultFetch;
  let response: Response;

  try {
    response = await withAbortTimeout(
      (signal) =>
        fetchFn(input.url, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${input.accessToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal,
        }),
      input.timeoutMs ?? defaultGitHubOAuthTimeoutMs,
    );
  } catch {
    throw getGitHubOAuthError(500);
  }

  if (!response.ok) {
    throw getGitHubOAuthError(response.status, response);
  }

  const payload = (await response.json()) as unknown;
  const parsedPayload = input.schema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new SourceAdapterError(
      'github-fetch-failed',
      'GitHub returned an unexpected response shape.',
      502,
    );
  }

  return parsedPayload.data;
}

export async function exchangeGitHubOAuthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  fetchFn?: GitHubOAuthFetch;
  redirectUri: string;
  timeoutMs?: number;
}): Promise<GitHubOAuthToken> {
  const fetchFn = input.fetchFn ?? defaultFetch;
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  let response: Response;

  try {
    response = await withAbortTimeout(
      (signal) =>
        fetchFn(githubOAuthTokenUrl, {
          body,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          method: 'POST',
          signal,
        }),
      input.timeoutMs ?? defaultGitHubOAuthTimeoutMs,
    );
  } catch {
    throw getGitHubOAuthError(500);
  }

  if (!response.ok) {
    throw getGitHubOAuthError(response.status, response);
  }

  const payload = (await response.json()) as unknown;
  const parsedPayload = githubOAuthTokenResponseSchema.safeParse(payload);

  if (!parsedPayload.success || parsedPayload.data.error || !parsedPayload.data.access_token) {
    throw new SourceAdapterError(
      'github-fetch-failed',
      'GitHub returned an unexpected OAuth response.',
      502,
    );
  }

  return {
    accessToken: parsedPayload.data.access_token,
    expiresAt: parsedPayload.data.expires_in
      ? new Date(Date.now() + parsedPayload.data.expires_in * 1000)
      : null,
    scopes: parseScopes(parsedPayload.data.scope),
  };
}

export async function getGitHubAuthenticatedUser(input: {
  accessToken: string;
  fetchFn?: GitHubOAuthFetch;
  timeoutMs?: number;
}): Promise<GitHubAuthenticatedUser> {
  const url = new URL(`${githubApiBaseUrl}/user`);
  const user = await fetchGitHubOAuthJson({
    accessToken: input.accessToken,
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    schema: githubAuthenticatedUserSchema,
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    url,
  });

  return {
    accountId: String(user.id),
    login: user.login,
  };
}

export async function listAuthenticatedGitHubRepositories(input: {
  accessToken: string;
  fetchFn?: GitHubOAuthFetch;
  maxRepositories?: number;
  timeoutMs?: number;
}): Promise<GitHubRepositoryResource[]> {
  const maxRepositories = input.maxRepositories ?? 500;
  const resources: GitHubRepositoryResource[] = [];
  let page = 1;

  while (resources.length < maxRepositories) {
    const pageSize = Math.min(100, maxRepositories - resources.length);
    const url = new URL(`${githubApiBaseUrl}/user/repos`);

    url.searchParams.set('affiliation', 'owner,collaborator,vault_member');
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(pageSize));
    url.searchParams.set('sort', 'updated');

    const repositories = await fetchGitHubOAuthJson({
      accessToken: input.accessToken,
      ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
      schema: githubRepositoryListSchema,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      url,
    });

    resources.push(
      ...repositories.map((repository) => ({
        defaultBranch: repository.default_branch ?? 'main',
        externalId: String(repository.id),
        fullName: repository.full_name,
        owner: repository.owner.login,
        private: repository.private,
        repo: repository.name,
        title: repository.full_name,
        type: 'repository',
        ...(repository.html_url ? { url: repository.html_url } : {}),
        ...(repository.updated_at ? { lastEditedTime: repository.updated_at } : {}),
      })),
    );

    if (repositories.length < pageSize) {
      break;
    }

    page += 1;
  }

  return resources;
}
