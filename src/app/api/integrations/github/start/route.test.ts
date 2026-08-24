import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/integrations/github/start/route';

import type { NextRequest } from 'next/server';

const workspaceIndexId = '00000000-0000-4000-8000-000000004301';
const sourceId = '00000000-0000-4000-8000-000000004302';
const vaultId = '00000000-0000-4000-8000-000000004303';

const mocks = vi.hoisted(() => ({
  createGitHubOAuthState: vi.fn(),
  getGitHubOAuthEnv: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
}));

vi.mock('@/lib/access/api-access', () => ({
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/env', () => ({
  getGitHubOAuthEnv: mocks.getGitHubOAuthEnv,
}));

vi.mock('@/lib/sources/github/github-oauth-api', () => ({
  githubOAuthReadScopes: ['repo', 'read:user'],
}));

vi.mock('@/lib/sources/github/oauth-state', () => ({
  createGitHubOAuthState: mocks.createGitHubOAuthState,
}));

function createRequest(
  params: Partial<{
    returnTo: string;
    sourceId: string;
    workspaceIndexId: string;
  }> = {},
): NextRequest {
  const url = new URL('http://localhost:3000/api/integrations/github/start');
  url.searchParams.set('workspaceIndexId', params.workspaceIndexId ?? workspaceIndexId);
  url.searchParams.set('sourceId', params.sourceId ?? sourceId);

  if (params.returnTo) {
    url.searchParams.set('returnTo', params.returnTo);
  }

  const request = new Request(url, {
    method: 'GET',
  }) as NextRequest;

  Object.defineProperty(request, 'nextUrl', {
    value: url,
  });

  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.getGitHubOAuthEnv.mockReturnValue({
    GITHUB_OAUTH_CLIENT_ID: 'github_client',
    GITHUB_OAUTH_CLIENT_SECRET: 'github_secret',
    GITHUB_REDIRECT_URI: 'http://localhost:3000/api/integrations/github/callback',
  });
  mocks.createGitHubOAuthState.mockReturnValue('signed-github-state');
});

describe('/api/integrations/github/start', () => {
  it('redirects to GitHub OAuth with signed workspace and source state', async () => {
    const response = await GET(
      createRequest({
        returnTo: '/sources',
      }),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location ?? '');
    expect(redirectUrl.origin).toBe('https://github.com');
    expect(redirectUrl.pathname).toBe('/login/oauth/authorize');
    expect(redirectUrl.searchParams.get('allow_signup')).toBe('true');
    expect(redirectUrl.searchParams.get('client_id')).toBe('github_client');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/integrations/github/callback',
    );
    expect(redirectUrl.searchParams.get('scope')).toBe('repo read:user');
    expect(redirectUrl.searchParams.get('state')).toBe('signed-github-state');
    expect(mocks.createGitHubOAuthState).toHaveBeenCalledWith({
      returnTo: '/sources',
      secret: 'github_secret',
      sourceId,
      workspaceIndexId,
    });
  });

  it('rejects invalid route query params before auth', async () => {
    const response = await GET(
      createRequest({
        sourceId: 'not-a-uuid',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireSourceManagementForRequest).not.toHaveBeenCalled();
  });

  it('returns a safe configuration error when OAuth env is missing', async () => {
    mocks.getGitHubOAuthEnv.mockImplementation(() => {
      throw new Error('missing env');
    });

    const response = await GET(createRequest());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'github-oauth-not-configured',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
  });
});
