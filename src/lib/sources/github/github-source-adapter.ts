import { z } from 'zod';

import { getGitHubEnv } from '@/lib/env';
import { SourceAdapterError } from '@/lib/sources/errors';
import { loadGitHubDocuments } from '@/lib/sources/github/load-github-documents';
import { listAuthenticatedGitHubRepositories } from '@/lib/sources/github/github-oauth-api';
import { GitHubRepoUrlError, parseGitHubRepoUrl } from '@/lib/sources/github/parse-github-url';
import { githubSourceConfigSchema } from '@/lib/validators/source';

import type { GitHubFetch } from '@/lib/sources/github/github-api';
import type { SourceAdapter, SourceAdapterContext } from '@/lib/sources/types';

export type GitHubSourceAdapterOptions = {
  fetchFn?: GitHubFetch;
  token?: string;
};

function getGitHubToken(input: { context?: SourceAdapterContext; tokenOverride?: string }): string {
  const credentialToken = input.context?.credential?.accessToken.trim();

  if (credentialToken) {
    return credentialToken;
  }

  if (input.context?.credential) {
    return '';
  }

  if (input.tokenOverride !== undefined) {
    return input.tokenOverride.trim();
  }

  try {
    return getGitHubEnv().GITHUB_TOKEN;
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new SourceAdapterError(
        'github-token-missing',
        'Set GITHUB_TOKEN with read-only Contents access before syncing GitHub repositories.',
        401,
      );
    }

    throw error;
  }
}

function validateRepoUrlMatchesConfig(config: { owner: string; repo: string; repoUrl: string }) {
  try {
    const parsedRepo = parseGitHubRepoUrl(config.repoUrl);

    if (parsedRepo.owner !== config.owner || parsedRepo.repo !== config.repo) {
      throw new SourceAdapterError(
        'invalid-input',
        'GitHub source config does not match the repository URL.',
        400,
      );
    }
  } catch (error: unknown) {
    if (error instanceof GitHubRepoUrlError) {
      throw new SourceAdapterError(error.code, error.message, 400);
    }

    throw error;
  }
}

export function createGitHubSourceAdapter(options: GitHubSourceAdapterOptions = {}): SourceAdapter {
  return {
    async listResources(context?: SourceAdapterContext) {
      const token = getGitHubToken({
        ...(context ? { context } : {}),
        ...(options.token !== undefined ? { tokenOverride: options.token } : {}),
      });

      if (!token) {
        throw new SourceAdapterError(
          'github-token-missing',
          'Connect GitHub or set GITHUB_TOKEN with read-only Contents access before listing repositories.',
          401,
        );
      }

      return listAuthenticatedGitHubRepositories({
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
        accessToken: token,
      });
    },
    async loadDocuments(config: unknown, context?: SourceAdapterContext) {
      const parsedConfig = githubSourceConfigSchema.safeParse(config);

      if (!parsedConfig.success) {
        throw new SourceAdapterError('invalid-input', 'GitHub source config is invalid.', 400);
      }

      validateRepoUrlMatchesConfig(parsedConfig.data);

      const token = getGitHubToken({
        ...(context ? { context } : {}),
        ...(options.token !== undefined ? { tokenOverride: options.token } : {}),
      });

      if (!token) {
        throw new SourceAdapterError(
          'github-token-missing',
          'Set GITHUB_TOKEN with read-only Contents access before syncing GitHub repositories.',
          401,
        );
      }

      return loadGitHubDocuments({
        config: parsedConfig.data,
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
        token,
      });
    },
    type: 'github',
  };
}
