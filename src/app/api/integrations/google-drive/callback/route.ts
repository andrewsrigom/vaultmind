import { NextResponse } from 'next/server';

import { upsertSourceCredential } from '@/db/queries/source-credentials';
import { upsertGoogleDriveSourceForWorkspaceIndex } from '@/db/queries/workspace-indexes';
import {
  getOAuthAccessDeniedStatus,
  requireSourceManagementForRequest,
} from '@/lib/access/api-access';
import { getGoogleDriveOAuthEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { buildCanonicalInternalUrl } from '@/lib/security/internal-url';
import { SourceAdapterError } from '@/lib/sources/errors';
import {
  exchangeGoogleDriveOAuthCode,
  listReadableGoogleDocs,
} from '@/lib/sources/google-drive/google-drive-api';
import { parseGoogleDriveOAuthState } from '@/lib/sources/google-drive/oauth-state';

import type { NextRequest } from 'next/server';
import type { GoogleDriveSourceResource } from '@/db/schema';

const logger = createLogger('google-drive-oauth-callback');
const googleDriveOAuthResourceLimit = 25;

function redirectWithStatus(_request: NextRequest, returnTo: string, status: string): NextResponse {
  const redirectUrl = new URL(
    buildCanonicalInternalUrl({ fallbackPath: '/integrations', path: returnTo }),
  );

  redirectUrl.searchParams.set('googleDrive', status);

  return NextResponse.redirect(redirectUrl);
}

function getFallbackRedirect(request: NextRequest, status: string): NextResponse {
  return redirectWithStatus(request, '/integrations', status);
}

export async function GET(request: NextRequest) {
  let env: ReturnType<typeof getGoogleDriveOAuthEnv>;

  try {
    env = getGoogleDriveOAuthEnv();
  } catch {
    return getFallbackRedirect(request, 'not-configured');
  }

  const rawState = request.nextUrl.searchParams.get('state');
  const state = rawState
    ? parseGoogleDriveOAuthState({
        secret: env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
        state: rawState,
      })
    : null;

  if (!state) {
    return getFallbackRedirect(request, 'invalid-state');
  }

  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return redirectWithStatus(request, state.returnTo, 'cancelled');
  }

  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return redirectWithStatus(request, state.returnTo, 'missing-code');
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId: state.workspaceIndexId,
  });

  if (!access.ok) {
    return redirectWithStatus(
      request,
      state.returnTo,
      getOAuthAccessDeniedStatus(access.response.status),
    );
  }

  try {
    const token = await exchangeGoogleDriveOAuthCode({
      clientId: env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
      code,
      redirectUri: env.GOOGLE_DRIVE_REDIRECT_URI,
    });
    const docs = await listReadableGoogleDocs({
      accessToken: token.accessToken,
      maxFiles: googleDriveOAuthResourceLimit,
    });
    const resources: GoogleDriveSourceResource[] = docs.map((doc) => ({
      externalId: doc.externalId,
      mimeType: doc.mimeType,
      title: doc.title,
      type: doc.type === 'document' ? 'document' : 'file',
      ...(doc.modifiedTime ? { modifiedTime: doc.modifiedTime } : {}),
      ...(doc.url ? { url: doc.url } : {}),
    }));
    const source = await upsertGoogleDriveSourceForWorkspaceIndex({
      resources,
      workspaceIndexId: state.workspaceIndexId,
    });

    if (!source) {
      return redirectWithStatus(request, state.returnTo, 'workspace-not-found');
    }

    await upsertSourceCredential({
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      provider: 'google-drive',
      refreshToken: token.refreshToken,
      scopes: token.scopes,
      sourceId: source.id,
    });

    return redirectWithStatus(request, state.returnTo, 'connected');
  } catch (callbackError: unknown) {
    if (callbackError instanceof SourceAdapterError) {
      logger.error('Google Drive OAuth callback failed with provider error.', callbackError, {
        code: callbackError.code,
        workspaceIndexId: state.workspaceIndexId,
      });
    } else {
      logger.error('Google Drive OAuth callback failed unexpectedly.', callbackError, {
        workspaceIndexId: state.workspaceIndexId,
      });
    }

    return redirectWithStatus(request, state.returnTo, 'failed');
  }
}
