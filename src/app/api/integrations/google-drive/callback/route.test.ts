import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/integrations/google-drive/callback/route';
import { SourceAdapterError } from '@/lib/sources/errors';

import type { NextRequest } from 'next/server';

const workspaceIndexId = '00000000-0000-4000-8000-000000004701';
const vaultId = '00000000-0000-4000-8000-000000004702';
const sourceId = '00000000-0000-4000-8000-000000004703';
const expiresAt = new Date('2026-07-01T00:00:00.000Z');

const mocks = vi.hoisted(() => ({
  exchangeGoogleDriveOAuthCode: vi.fn(),
  getGoogleDriveOAuthEnv: vi.fn(),
  listReadableGoogleDocs: vi.fn(),
  loggerError: vi.fn(),
  parseGoogleDriveOAuthState: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
  upsertGoogleDriveSourceForWorkspaceIndex: vi.fn(),
  upsertSourceCredential: vi.fn(),
}));

vi.mock('@/db/queries/source-credentials', () => ({
  upsertSourceCredential: mocks.upsertSourceCredential,
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  upsertGoogleDriveSourceForWorkspaceIndex: mocks.upsertGoogleDriveSourceForWorkspaceIndex,
}));

vi.mock('@/lib/access/api-access', () => ({
  getOAuthAccessDeniedStatus: (responseStatus: number) =>
    responseStatus === 401 ? 'auth-required' : 'forbidden',
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/env', () => ({
  getGoogleDriveOAuthEnv: mocks.getGoogleDriveOAuthEnv,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

vi.mock('@/lib/sources/google-drive/google-drive-api', () => ({
  exchangeGoogleDriveOAuthCode: mocks.exchangeGoogleDriveOAuthCode,
  listReadableGoogleDocs: mocks.listReadableGoogleDocs,
}));

vi.mock('@/lib/sources/google-drive/oauth-state', () => ({
  parseGoogleDriveOAuthState: mocks.parseGoogleDriveOAuthState,
}));

function createRequest(
  params: Partial<{
    code: string;
    error: string;
    state: string;
  }> = {},
): NextRequest {
  const url = new URL('http://localhost:3000/api/integrations/google-drive/callback');

  if (params.state !== undefined) {
    url.searchParams.set('state', params.state);
  } else {
    url.searchParams.set('state', 'signed-google-state');
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

function expectGoogleDriveRedirect(response: Response, path: string, status: string): void {
  expect(response.status).toBe(307);
  const location = response.headers.get('location');
  expect(location).toBeTruthy();
  const redirectUrl = new URL(location ?? '');

  expect(redirectUrl.origin).toBe('http://localhost:3000');
  expect(redirectUrl.pathname).toBe(path);
  expect(redirectUrl.searchParams.get('googleDrive')).toBe(status);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGoogleDriveOAuthEnv.mockReturnValue({
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: 'google_client',
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: 'google_secret',
    GOOGLE_DRIVE_REDIRECT_URI: 'http://localhost:3000/api/integrations/google-drive/callback',
  });
  mocks.parseGoogleDriveOAuthState.mockReturnValue({
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
  mocks.exchangeGoogleDriveOAuthCode.mockResolvedValue({
    accessToken: 'google_access',
    expiresAt,
    refreshToken: 'google_refresh',
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  mocks.listReadableGoogleDocs.mockResolvedValue([
    {
      externalId: 'doc_1',
      mimeType: 'application/vnd.google-apps.document',
      modifiedTime: '2026-06-01T10:00:00.000Z',
      title: 'Delivery Plan',
      type: 'document',
      url: 'https://docs.google.com/document/d/doc_1',
    },
    {
      externalId: 'file_1',
      mimeType: 'text/markdown',
      title: 'Readme',
      type: 'file',
    },
  ]);
  mocks.upsertGoogleDriveSourceForWorkspaceIndex.mockResolvedValue({
    id: sourceId,
  });
  mocks.upsertSourceCredential.mockResolvedValue({
    id: 'credential_123',
  });
});

describe('/api/integrations/google-drive/callback', () => {
  it('exchanges the code, stores readable docs, and redirects connected', async () => {
    const response = await GET(createRequest());

    expectGoogleDriveRedirect(response, '/sources', 'connected');
    expect(mocks.parseGoogleDriveOAuthState).toHaveBeenCalledWith({
      secret: 'google_secret',
      state: 'signed-google-state',
    });
    expect(mocks.requireSourceManagementForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      workspaceIndexId,
    });
    expect(mocks.exchangeGoogleDriveOAuthCode).toHaveBeenCalledWith({
      clientId: 'google_client',
      clientSecret: 'google_secret',
      code: 'oauth-code',
      redirectUri: 'http://localhost:3000/api/integrations/google-drive/callback',
    });
    expect(mocks.listReadableGoogleDocs).toHaveBeenCalledWith({
      accessToken: 'google_access',
      maxFiles: 25,
    });
    expect(mocks.upsertGoogleDriveSourceForWorkspaceIndex).toHaveBeenCalledWith({
      resources: [
        {
          externalId: 'doc_1',
          mimeType: 'application/vnd.google-apps.document',
          modifiedTime: '2026-06-01T10:00:00.000Z',
          title: 'Delivery Plan',
          type: 'document',
          url: 'https://docs.google.com/document/d/doc_1',
        },
        {
          externalId: 'file_1',
          mimeType: 'text/markdown',
          title: 'Readme',
          type: 'file',
        },
      ],
      workspaceIndexId,
    });
    expect(mocks.upsertSourceCredential).toHaveBeenCalledWith({
      accessToken: 'google_access',
      expiresAt,
      provider: 'google-drive',
      refreshToken: 'google_refresh',
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      sourceId,
    });
  });

  it('redirects to the fallback integration page when env or state is invalid', async () => {
    mocks.getGoogleDriveOAuthEnv.mockImplementationOnce(() => {
      throw new Error('missing env');
    });
    const missingEnvResponse = await GET(createRequest());

    mocks.parseGoogleDriveOAuthState.mockReturnValueOnce(null);
    const invalidStateResponse = await GET(createRequest());

    expectGoogleDriveRedirect(missingEnvResponse, '/integrations', 'not-configured');
    expectGoogleDriveRedirect(invalidStateResponse, '/integrations', 'invalid-state');
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

    expectGoogleDriveRedirect(cancelledResponse, '/sources', 'cancelled');
    expectGoogleDriveRedirect(missingCodeResponse, '/sources', 'missing-code');
    expect(mocks.requireSourceManagementForRequest).not.toHaveBeenCalled();
  });

  it('uses the canonical fallback for a backslash return path', async () => {
    mocks.parseGoogleDriveOAuthState.mockReturnValue({
      returnTo: '/\\evil.example/path',
      workspaceIndexId,
    });

    const response = await GET(
      createRequest({
        error: 'access_denied',
      }),
    );

    expectGoogleDriveRedirect(response, '/integrations', 'cancelled');
  });

  it('maps source-management auth failures to OAuth-safe redirect statuses', async () => {
    mocks.requireSourceManagementForRequest.mockResolvedValue({
      ok: false,
      response: new Response(null, {
        status: 403,
      }),
    });

    const response = await GET(createRequest());

    expectGoogleDriveRedirect(response, '/sources', 'forbidden');
    expect(mocks.exchangeGoogleDriveOAuthCode).not.toHaveBeenCalled();
  });

  it('redirects workspace-not-found when the workspace source cannot be upserted', async () => {
    mocks.upsertGoogleDriveSourceForWorkspaceIndex.mockResolvedValue(null);

    const response = await GET(createRequest());

    expectGoogleDriveRedirect(response, '/sources', 'workspace-not-found');
    expect(mocks.upsertSourceCredential).not.toHaveBeenCalled();
  });

  it('redirects failed when the provider listing fails without leaking provider details', async () => {
    mocks.listReadableGoogleDocs.mockRejectedValue(
      new SourceAdapterError('google-drive-unauthorized', 'raw provider detail', 401),
    );

    const response = await GET(createRequest());

    expectGoogleDriveRedirect(response, '/sources', 'failed');
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Google Drive OAuth callback failed with provider error.',
      expect.any(SourceAdapterError),
      {
        code: 'google-drive-unauthorized',
        workspaceIndexId,
      },
    );
    expect(mocks.upsertSourceCredential).not.toHaveBeenCalled();
  });
});
