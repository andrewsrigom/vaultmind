import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/integrations/github/callback/route';
import { SourceAdapterError } from '@/lib/sources/errors';

import type { NextRequest } from 'next/server';

const workspaceIndexId = '00000000-0000-4000-8000-000000004601';
const vaultId = '00000000-0000-4000-8000-000000004602';
const sourceId = '00000000-0000-4000-8000-000000004603';
const expiresAt = new Date('2026-07-01T00:00:00.000Z');

const db = {
  kind: 'db',
};

const mocks = vi.hoisted(() => ({
  exchangeGitHubOAuthCode: vi.fn(),
  getDb: vi.fn(),
  getGitHubAuthenticatedUser: vi.fn(),
  getGitHubOAuthEnv: vi.fn(),
  getSyncableWorkspaceSource: vi.fn(),
  loggerError: vi.fn(),
  parseGitHubOAuthState: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
  upsertSourceCredential: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/db/queries/source-credentials', () => ({
  upsertSourceCredential: mocks.upsertSourceCredential,
}));

vi.mock('@/db/queries/sync-jobs', () => ({
  getSyncableWorkspaceSource: mocks.getSyncableWorkspaceSource,
}));

vi.mock('@/lib/access/api-access', () => ({
  getOAuthAccessDeniedStatus: (responseStatus: number) =>
    responseStatus === 401 ? 'auth-required' : 'forbidden',
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/env', () => ({
  getGitHubOAuthEnv: mocks.getGitHubOAuthEnv,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

vi.mock('@/lib/sources/github/github-oauth-api', () => ({
  exchangeGitHubOAuthCode: mocks.exchangeGitHubOAuthCode,
  getGitHubAuthenticatedUser: mocks.getGitHubAuthenticatedUser,
}));

vi.mock('@/lib/sources/github/oauth-state', () => ({
  parseGitHubOAuthState: mocks.parseGitHubOAuthState,
}));

function createRequest(
  params: Partial<{
    code: string;
    error: string;
    state: string;
  }> = {},
): NextRequest {
  const url = new URL('http://localhost:3000/api/integrations/github/callback');

  if (params.state !== undefined) {
    url.searchParams.set('state', params.state);
  } else {
    url.searchParams.set('state', 'signed-github-state');
  }

  if (params.code !== undefined) {
    url.searchParams.set('code', params.code);
  } else if (!params.error) {
    url.searchParams.set('code', 'oauth-code');
  }

  if (params.error) {
    url.searchParams.set('error', params.error);
  }

  const request = new Request(url, {
    method: 'GET',
  }) as NextRequest;

  Object.defineProperty(request, 'nextUrl', {
    value: url,
  });

  return request;
}

function expectGitHubRedirect(response: Response, path: string, status: string): void {
  expect(response.status).toBe(307);
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  const redirectUrl = new URL(location ?? '');

  expect(redirectUrl.origin).toBe('http://localhost:3000');
  expect(redirectUrl.pathname).toBe(path);
  expect(redirectUrl.searchParams.get('github')).toBe(status);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockReturnValue(db);
  mocks.getGitHubOAuthEnv.mockReturnValue({
    GITHUB_OAUTH_CLIENT_ID: 'github_client',
    GITHUB_OAUTH_CLIENT_SECRET: 'github_secret',
    GITHUB_REDIRECT_URI: 'http://localhost:3000/api/integrations/github/callback',
  });
  mocks.parseGitHubOAuthState.mockReturnValue({
    returnTo: '/sources',
    sourceId,
    workspaceIndexId,
  });
  mocks.requireSourceManagementForRequest.mockResolvedValue({
    context: {
      permissions: ['sources.manage'],
      roles: [],
      userId: 'user_123',
      vaultId,
    },
    ok: true,
    session: {
      user: {
        id: 'user_123',
      },
    },
    workspaceIndex: {
      id: workspaceIndexId,
      vaultId,
    },
  });
  mocks.getSyncableWorkspaceSource.mockResolvedValue({
    id: sourceId,
    type: 'github',
  });
  mocks.exchangeGitHubOAuthCode.mockResolvedValue({
    accessToken: 'github_access',
    expiresAt,
    scopes: ['repo', 'read:user'],
  });
  mocks.getGitHubAuthenticatedUser.mockResolvedValue({
    accountId: '12345',
    login: 'octocat',
  });
  mocks.upsertSourceCredential.mockResolvedValue({
    id: 'credential_123',
  });
});

describe('/api/integrations/github/callback', () => {
  it('exchanges the code for an existing GitHub source and stores credentials', async () => {
    const response = await GET(createRequest());

    expectGitHubRedirect(response, '/sources', 'connected');
    expect(mocks.parseGitHubOAuthState).toHaveBeenCalledWith({
      secret: 'github_secret',
      state: 'signed-github-state',
    });
    expect(mocks.requireSourceManagementForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      workspaceIndexId,
    });
    expect(mocks.getSyncableWorkspaceSource).toHaveBeenCalledWith({
      db,
      sourceId,
      workspaceIndexId,
    });
    expect(mocks.exchangeGitHubOAuthCode).toHaveBeenCalledWith({
      clientId: 'github_client',
      clientSecret: 'github_secret',
      code: 'oauth-code',
      redirectUri: 'http://localhost:3000/api/integrations/github/callback',
    });
    expect(mocks.getGitHubAuthenticatedUser).toHaveBeenCalledWith({
      accessToken: 'github_access',
    });
    expect(mocks.upsertSourceCredential).toHaveBeenCalledWith({
      accessToken: 'github_access',
      accountId: '12345',
      accountName: 'octocat',
      expiresAt,
      provider: 'github',
      scopes: ['repo', 'read:user'],
      sourceId,
    });
  });

  it('redirects to the fallback integration page when env or state is invalid', async () => {
    mocks.getGitHubOAuthEnv.mockImplementationOnce(() => {
      throw new Error('missing env');
    });
    const missingEnvResponse = await GET(createRequest());

    mocks.parseGitHubOAuthState.mockReturnValueOnce(null);
    const invalidStateResponse = await GET(createRequest());

    expectGitHubRedirect(missingEnvResponse, '/integrations', 'not-configured');
    expectGitHubRedirect(invalidStateResponse, '/integrations', 'invalid-state');
    expect(mocks.requireSourceManagementForRequest).not.toHaveBeenCalled();
  });

  it('redirects cancelled or missing code before authorization', async () => {
    const cancelledResponse = await GET(
      createRequest({
        error: 'access_denied',
      }),
    );
    const missingCodeResponse = await GET(
      createRequest({
        code: '',
      }),
    );

    expectGitHubRedirect(cancelledResponse, '/sources', 'cancelled');
    expectGitHubRedirect(missingCodeResponse, '/sources', 'missing-code');
    expect(mocks.requireSourceManagementForRequest).not.toHaveBeenCalled();
  });

  it('uses the canonical fallback for a backslash return path', async () => {
    mocks.parseGitHubOAuthState.mockReturnValue({
      returnTo: '/\\evil.example/path',
      sourceId,
      workspaceIndexId,
    });

    const response = await GET(
      createRequest({
        error: 'access_denied',
      }),
    );

    expectGitHubRedirect(response, '/integrations', 'cancelled');
  });

  it('redirects source-not-found when the signed source is not a GitHub source', async () => {
    mocks.getSyncableWorkspaceSource.mockResolvedValue({
      id: sourceId,
      type: 'notion',
    });

    const response = await GET(createRequest());

    expectGitHubRedirect(response, '/sources', 'source-not-found');
    expect(mocks.exchangeGitHubOAuthCode).not.toHaveBeenCalled();
  });

  it('maps source-management auth failures to OAuth-safe redirect statuses', async () => {
    mocks.requireSourceManagementForRequest.mockResolvedValue({
      ok: false,
      response: new Response(null, {
        status: 403,
      }),
    });

    const response = await GET(createRequest());

    expectGitHubRedirect(response, '/sources', 'forbidden');
    expect(mocks.getSyncableWorkspaceSource).not.toHaveBeenCalled();
  });

  it('redirects failed when the provider lookup fails without leaking provider details', async () => {
    mocks.getGitHubAuthenticatedUser.mockRejectedValue(
      new SourceAdapterError('github-unauthorized', 'raw provider detail', 401),
    );

    const response = await GET(createRequest());

    expectGitHubRedirect(response, '/sources', 'failed');
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'GitHub OAuth callback failed with provider error.',
      expect.any(SourceAdapterError),
      {
        code: 'github-unauthorized',
        sourceId,
        workspaceIndexId,
      },
    );
    expect(mocks.upsertSourceCredential).not.toHaveBeenCalled();
  });
});
