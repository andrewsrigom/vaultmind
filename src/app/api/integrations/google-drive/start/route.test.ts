import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/integrations/google-drive/start/route';

import type { NextRequest } from 'next/server';

const workspaceIndexId = '00000000-0000-4000-8000-000000004401';
const vaultId = '00000000-0000-4000-8000-000000004402';

const mocks = vi.hoisted(() => ({
  createGoogleDriveOAuthState: vi.fn(),
  getGoogleDriveOAuthEnv: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
}));

vi.mock('@/lib/access/api-access', () => ({
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/env', () => ({
  getGoogleDriveOAuthEnv: mocks.getGoogleDriveOAuthEnv,
}));

vi.mock('@/lib/sources/google-drive/google-drive-api', () => ({
  googleDriveReadOnlyScope: 'https://www.googleapis.com/auth/drive.readonly',
}));

vi.mock('@/lib/sources/google-drive/oauth-state', () => ({
  createGoogleDriveOAuthState: mocks.createGoogleDriveOAuthState,
}));

function createRequest(
  params: Partial<{
    returnTo: string;
    workspaceIndexId: string;
  }> = {},
): NextRequest {
  const url = new URL('http://localhost:3000/api/integrations/google-drive/start');
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
  mocks.getGoogleDriveOAuthEnv.mockReturnValue({
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: 'google_client',
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: 'google_secret',
    GOOGLE_DRIVE_REDIRECT_URI: 'http://localhost:3000/api/integrations/google-drive/callback',
  });
  mocks.createGoogleDriveOAuthState.mockReturnValue('signed-google-state');
});

describe('/api/integrations/google-drive/start', () => {
  it('redirects to Google OAuth with signed workspace state and read-only scope', async () => {
    const response = await GET(
      createRequest({
        returnTo: '/sources',
      }),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location ?? '');
    expect(redirectUrl.origin).toBe('https://accounts.google.com');
    expect(redirectUrl.pathname).toBe('/o/oauth2/v2/auth');
    expect(redirectUrl.searchParams.get('access_type')).toBe('offline');
    expect(redirectUrl.searchParams.get('client_id')).toBe('google_client');
    expect(redirectUrl.searchParams.get('include_granted_scopes')).toBe('true');
    expect(redirectUrl.searchParams.get('prompt')).toBe('consent');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/integrations/google-drive/callback',
    );
    expect(redirectUrl.searchParams.get('response_type')).toBe('code');
    expect(redirectUrl.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/drive.readonly',
    );
    expect(redirectUrl.searchParams.get('state')).toBe('signed-google-state');
    expect(mocks.createGoogleDriveOAuthState).toHaveBeenCalledWith({
      returnTo: '/sources',
      secret: 'google_secret',
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
    mocks.getGoogleDriveOAuthEnv.mockImplementation(() => {
      throw new Error('missing env');
    });

    const response = await GET(createRequest());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'google-drive-oauth-not-configured',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
  });
});
