import { describe, expect, it } from 'vitest';

import {
  exchangeGitHubOAuthCode,
  getGitHubAuthenticatedUser,
  listAuthenticatedGitHubRepositories,
} from '@/lib/sources/github/github-oauth-api';

import type { GitHubOAuthFetch } from '@/lib/sources/github/github-oauth-api';

describe('github-oauth-api request timeouts', () => {
  it('passes abort signals to token and API requests', async () => {
    const capturedSignals: AbortSignal[] = [];
    const fetchFn: GitHubOAuthFetch = async (input, init) => {
      const url = input.toString();

      if (init?.signal) {
        capturedSignals.push(init.signal);
      }

      if (url === 'https://github.com/login/oauth/access_token') {
        return Response.json({
          access_token: 'github-token',
          expires_in: 3600,
          scope: 'repo read:user',
        });
      }

      if (url === 'https://api.github.com/user') {
        return Response.json({
          id: 123,
          login: 'vaultmind-bot',
        });
      }

      return Response.json([]);
    };

    await exchangeGitHubOAuthCode({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      code: 'oauth-code',
      fetchFn,
      redirectUri: 'https://app.example.com/callback',
      timeoutMs: 50,
    });
    await getGitHubAuthenticatedUser({
      accessToken: 'github-token',
      fetchFn,
      timeoutMs: 50,
    });
    await listAuthenticatedGitHubRepositories({
      accessToken: 'github-token',
      fetchFn,
      timeoutMs: 50,
    });

    expect(capturedSignals).toHaveLength(3);
    expect(capturedSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });
});
