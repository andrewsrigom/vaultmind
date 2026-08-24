import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/integrations/notion/callback/route';
import { SourceAdapterError } from '@/lib/sources/errors';

import type { NextRequest } from 'next/server';

const workspaceIndexId = '00000000-0000-4000-8000-000000004501';
const vaultId = '00000000-0000-4000-8000-000000004502';
const sourceId = '00000000-0000-4000-8000-000000004503';

const mocks = vi.hoisted(() => ({
  exchangeNotionOAuthCode: vi.fn(),
  getNotionOAuthEnv: vi.fn(),
  listSharedNotionPages: vi.fn(),
  loggerError: vi.fn(),
  parseNotionOAuthState: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
  upsertNotionSourceForWorkspaceIndex: vi.fn(),
  upsertSourceCredential: vi.fn(),
}));

vi.mock('@/db/queries/source-credentials', () => ({
  upsertSourceCredential: mocks.upsertSourceCredential,
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  upsertNotionSourceForWorkspaceIndex: mocks.upsertNotionSourceForWorkspaceIndex,
}));

vi.mock('@/lib/access/api-access', () => ({
  getOAuthAccessDeniedStatus: (responseStatus: number) =>
    responseStatus === 401 ? 'auth-required' : 'forbidden',
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/env', () => ({
  getNotionOAuthEnv: mocks.getNotionOAuthEnv,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

vi.mock('@/lib/sources/notion/notion-api', () => ({
  exchangeNotionOAuthCode: mocks.exchangeNotionOAuthCode,
  listSharedNotionPages: mocks.listSharedNotionPages,
}));

vi.mock('@/lib/sources/notion/oauth-state', () => ({
  parseNotionOAuthState: mocks.parseNotionOAuthState,
}));

function createRequest(
  params: Partial<{
    code: string;
    error: string;
    state: string;
  }> = {},
): NextRequest {
  const url = new URL('http://localhost:3000/api/integrations/notion/callback');

  if (params.state !== undefined) {
    url.searchParams.set('state', params.state);
  } else {
    url.searchParams.set('state', 'signed-state');
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

function expectNotionRedirect(response: Response, path: string, status: string): void {
  expect(response.status).toBe(307);
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  const redirectUrl = new URL(location ?? '');

  expect(redirectUrl.origin).toBe('http://localhost:3000');
  expect(redirectUrl.pathname).toBe(path);
  expect(redirectUrl.searchParams.get('notion')).toBe(status);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNotionOAuthEnv.mockReturnValue({
    NOTION_OAUTH_CLIENT_ID: 'notion_client',
    NOTION_OAUTH_CLIENT_SECRET: 'notion_secret',
    NOTION_REDIRECT_URI: 'http://localhost:3000/api/integrations/notion/callback',
  });
  mocks.parseNotionOAuthState.mockReturnValue({
    returnTo: '/sources',
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
  mocks.exchangeNotionOAuthCode.mockResolvedValue({
    accessToken: 'notion_access',
    botId: 'notion_bot',
    refreshToken: 'notion_refresh',
    workspaceId: 'notion_workspace',
    workspaceName: 'Product Wiki',
  });
  mocks.listSharedNotionPages.mockResolvedValue([
    {
      externalId: 'page_1',
      lastEditedTime: '2026-06-01T10:00:00.000Z',
      title: 'Architecture Notes',
      url: 'https://notion.so/page-1',
    },
    {
      externalId: 'page_2',
      title: 'Delivery Process',
    },
  ]);
  mocks.upsertNotionSourceForWorkspaceIndex.mockResolvedValue({
    id: sourceId,
  });
  mocks.upsertSourceCredential.mockResolvedValue({
    id: 'credential_123',
  });
});

describe('/api/integrations/notion/callback', () => {
  it('exchanges the code, stores Notion resources, and redirects connected', async () => {
    const response = await GET(createRequest());

    expectNotionRedirect(response, '/sources', 'connected');
    expect(mocks.parseNotionOAuthState).toHaveBeenCalledWith({
      secret: 'notion_secret',
      state: 'signed-state',
    });
    expect(mocks.requireSourceManagementForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      workspaceIndexId,
    });
    expect(mocks.exchangeNotionOAuthCode).toHaveBeenCalledWith({
      clientId: 'notion_client',
      clientSecret: 'notion_secret',
      code: 'oauth-code',
      redirectUri: 'http://localhost:3000/api/integrations/notion/callback',
    });
    expect(mocks.listSharedNotionPages).toHaveBeenCalledWith({
      accessToken: 'notion_access',
    });
    expect(mocks.upsertNotionSourceForWorkspaceIndex).toHaveBeenCalledWith({
      resources: [
        {
          externalId: 'page_1',
          lastEditedTime: '2026-06-01T10:00:00.000Z',
          title: 'Architecture Notes',
          type: 'page',
          url: 'https://notion.so/page-1',
        },
        {
          externalId: 'page_2',
          title: 'Delivery Process',
          type: 'page',
        },
      ],
      workspaceId: 'notion_workspace',
      workspaceIndexId,
      workspaceName: 'Product Wiki',
    });
    expect(mocks.upsertSourceCredential).toHaveBeenCalledWith({
      accessToken: 'notion_access',
      accountId: 'notion_bot',
      accountName: 'Product Wiki',
      provider: 'notion',
      refreshToken: 'notion_refresh',
      sourceId,
    });
  });

  it('redirects to the fallback integration page for invalid state', async () => {
    mocks.parseNotionOAuthState.mockReturnValue(null);

    const response = await GET(createRequest());

    expectNotionRedirect(response, '/integrations', 'invalid-state');
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

    expectNotionRedirect(cancelledResponse, '/sources', 'cancelled');
    expectNotionRedirect(missingCodeResponse, '/sources', 'missing-code');
    expect(mocks.requireSourceManagementForRequest).not.toHaveBeenCalled();
  });

  it('uses the canonical fallback for a backslash return path', async () => {
    mocks.parseNotionOAuthState.mockReturnValue({
      returnTo: '/\\evil.example/path',
      workspaceIndexId,
    });

    const response = await GET(
      createRequest({
        error: 'access_denied',
      }),
    );

    expectNotionRedirect(response, '/integrations', 'cancelled');
  });

  it('maps source-management auth failures to OAuth-safe redirect statuses', async () => {
    mocks.requireSourceManagementForRequest.mockResolvedValue({
      ok: false,
      response: new Response(null, {
        status: 401,
      }),
    });

    const response = await GET(createRequest());

    expectNotionRedirect(response, '/sources', 'auth-required');
    expect(mocks.exchangeNotionOAuthCode).not.toHaveBeenCalled();
  });

  it('redirects failed when the provider exchange fails without leaking provider details', async () => {
    mocks.exchangeNotionOAuthCode.mockRejectedValue(
      new SourceAdapterError('notion-unauthorized', 'raw provider detail', 401),
    );

    const response = await GET(createRequest());

    expectNotionRedirect(response, '/sources', 'failed');
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Notion OAuth callback failed with provider error.',
      expect.any(SourceAdapterError),
      {
        code: 'notion-unauthorized',
        workspaceIndexId,
      },
    );
    expect(mocks.upsertSourceCredential).not.toHaveBeenCalled();
  });
});
