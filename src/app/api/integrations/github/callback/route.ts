import { NextResponse } from 'next/server';

import { getDb } from '@/db';
import { upsertSourceCredential } from '@/db/queries/source-credentials';
import { getSyncableWorkspaceSource } from '@/db/queries/sync-jobs';
import {
  getOAuthAccessDeniedStatus,
  requireSourceManagementForRequest,
} from '@/lib/access/api-access';
import { getGitHubOAuthEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { buildCanonicalInternalUrl } from '@/lib/security/internal-url';
import { SourceAdapterError } from '@/lib/sources/errors';
import {
  exchangeGitHubOAuthCode,
  getGitHubAuthenticatedUser,
} from '@/lib/sources/github/github-oauth-api';
import { parseGitHubOAuthState } from '@/lib/sources/github/oauth-state';

import type { NextRequest } from 'next/server';

const logger = createLogger('github-oauth-callback');

function redirectWithStatus(_request: NextRequest, returnTo: string, status: string): NextResponse {
  const redirectUrl = new URL(
    buildCanonicalInternalUrl({ fallbackPath: '/integrations', path: returnTo }),
  );

  redirectUrl.searchParams.set('github', status);

  return NextResponse.redirect(redirectUrl);
}

function getFallbackRedirect(request: NextRequest, status: string): NextResponse {
  return redirectWithStatus(request, '/integrations', status);
}

export async function GET(request: NextRequest) {
  let env: ReturnType<typeof getGitHubOAuthEnv>;

  try {
    env = getGitHubOAuthEnv();
  } catch {
    return getFallbackRedirect(request, 'not-configured');
  }

  const rawState = request.nextUrl.searchParams.get('state');
  const state = rawState
    ? parseGitHubOAuthState({
        secret: env.GITHUB_OAUTH_CLIENT_SECRET,
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
    const db = getDb();
    const source = await getSyncableWorkspaceSource({
      db,
      sourceId: state.sourceId,
      workspaceIndexId: state.workspaceIndexId,
    });

    if (!source || source.type !== 'github') {
      return redirectWithStatus(request, state.returnTo, 'source-not-found');
    }

    const token = await exchangeGitHubOAuthCode({
      clientId: env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirectUri: env.GITHUB_REDIRECT_URI,
    });
    const account = await getGitHubAuthenticatedUser({
      accessToken: token.accessToken,
    });

    await upsertSourceCredential({
      accessToken: token.accessToken,
      accountId: account.accountId,
      accountName: account.login,
      expiresAt: token.expiresAt,
      provider: 'github',
      scopes: token.scopes,
      sourceId: source.id,
    });

    return redirectWithStatus(request, state.returnTo, 'connected');
  } catch (callbackError: unknown) {
    if (callbackError instanceof SourceAdapterError) {
      logger.error('GitHub OAuth callback failed with provider error.', callbackError, {
        code: callbackError.code,
        sourceId: state.sourceId,
        workspaceIndexId: state.workspaceIndexId,
      });
    } else {
      logger.error('GitHub OAuth callback failed unexpectedly.', callbackError, {
        sourceId: state.sourceId,
        workspaceIndexId: state.workspaceIndexId,
      });
    }

    return redirectWithStatus(request, state.returnTo, 'failed');
  }
}
