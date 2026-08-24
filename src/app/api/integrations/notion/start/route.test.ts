import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/integrations/notion/start/route';

import type { NextRequest } from 'next/server';

const workspaceIndexId = '00000000-0000-4000-8000-000000004201';
const vaultId = '00000000-0000-4000-8000-000000004202';

const mocks = vi.hoisted(() => ({
  createNotionOAuthState: vi.fn(),
  getNotionOAuthEnv: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
}));

vi.mock('@/lib/access/api-access', () => ({
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/env', () => ({
  getNotionOAuthEnv: mocks.getNotionOAuthEnv,
}));

vi.mock('@/lib/sources/notion/oauth-state', () => ({
  createNotionOAuthState: mocks.createNotionOAuthState,
}));

function createRequest(
  params: Partial<{
    returnTo: string;
    workspaceIndexId: string;
  }> = {},
): NextRequest {
  const url = new URL('http://localhost:3000/api/integrations/notion/start');
  url.searchParams.set('workspaceIndexId', params.workspaceIndexId ?? workspaceIndexId);

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
  mocks.getNotionOAuthEnv.mockReturnValue({
    NOTION_OAUTH_CLIENT_ID: 'notion_client',
    NOTION_OAUTH_CLIENT_SECRET: 'notion_secret',
    NOTION_REDIRECT_URI: 'http://localhost:3000/api/integrations/notion/callback',
  });
  mocks.createNotionOAuthState.mockReturnValue('signed-state');
});

describe('/api/integrations/notion/start', () => {
  it('redirects to Notion OAuth with signed workspace state', async () => {
    const response = await GET(
      createRequest({
        returnTo: '/sources',
      }),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location ?? '');
    expect(redirectUrl.origin).toBe('https://api.notion.com');
    expect(redirectUrl.pathname).toBe('/v1/oauth/authorize');
    expect(redirectUrl.searchParams.get('client_id')).toBe('notion_client');
    expect(redirectUrl.searchParams.get('owner')).toBe('user');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/integrations/notion/callback',
    );
    expect(redirectUrl.searchParams.get('response_type')).toBe('code');
    expect(redirectUrl.searchParams.get('state')).toBe('signed-state');
    expect(mocks.createNotionOAuthState).toHaveBeenCalledWith({
      returnTo: '/sources',
      secret: 'notion_secret',
      workspaceIndexId,
    });
  });

  it('rejects invalid workspace ids before auth', async () => {
    const response = await GET(
      createRequest({
        workspaceIndexId: 'not-a-uuid',
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
    mocks.getNotionOAuthEnv.mockImplementation(() => {
      throw new Error('missing env');
    });

    const response = await GET(createRequest());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'notion-oauth-not-configured',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
  });
});
