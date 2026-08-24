import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError } from '@/lib/api/responses';
import { requireSourceManagementForRequest } from '@/lib/access/api-access';
import { getGoogleDriveOAuthEnv } from '@/lib/env';
import { googleDriveReadOnlyScope } from '@/lib/sources/google-drive/google-drive-api';
import { createGoogleDriveOAuthState } from '@/lib/sources/google-drive/oauth-state';

import type { NextRequest } from 'next/server';

const googleAuthorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth';

const startSearchParamsSchema = z.object({
  returnTo: z.string().optional().default('/integrations'),
  workspaceIndexId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const parsedParams = startSearchParamsSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );

  if (!parsedParams.success) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId: parsedParams.data.workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  let env: ReturnType<typeof getGoogleDriveOAuthEnv>;

  try {
    env = getGoogleDriveOAuthEnv();
  } catch {
    return apiError(
      'google-drive-oauth-not-configured',
      'Set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, and GOOGLE_DRIVE_REDIRECT_URI before connecting Google Drive.',
      500,
    );
  }

  const state = createGoogleDriveOAuthState({
    returnTo: parsedParams.data.returnTo,
    secret: env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
    workspaceIndexId: parsedParams.data.workspaceIndexId,
  });
  const authorizationUrl = new URL(googleAuthorizeUrl);

  authorizationUrl.searchParams.set('access_type', 'offline');
  authorizationUrl.searchParams.set('client_id', env.GOOGLE_DRIVE_OAUTH_CLIENT_ID);
  authorizationUrl.searchParams.set('include_granted_scopes', 'true');
  authorizationUrl.searchParams.set('prompt', 'consent');
  authorizationUrl.searchParams.set('redirect_uri', env.GOOGLE_DRIVE_REDIRECT_URI);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', googleDriveReadOnlyScope);
  authorizationUrl.searchParams.set('state', state);

  return NextResponse.redirect(authorizationUrl);
}
