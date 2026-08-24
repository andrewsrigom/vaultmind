import { NextResponse } from 'next/server';

import { upsertSourceCredential } from '@/db/queries/source-credentials';
import { upsertNotionSourceForWorkspaceIndex } from '@/db/queries/workspace-indexes';
import {
  getOAuthAccessDeniedStatus,
  requireSourceManagementForRequest,
} from '@/lib/access/api-access';
import { getNotionOAuthEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { buildCanonicalInternalUrl } from '@/lib/security/internal-url';
import { SourceAdapterError } from '@/lib/sources/errors';
import { exchangeNotionOAuthCode, listSharedNotionPages } from '@/lib/sources/notion/notion-api';
import { parseNotionOAuthState } from '@/lib/sources/notion/oauth-state';

import type { NextRequest } from 'next/server';
import type { NotionSourceResource } from '@/db/schema';

const logger = createLogger('notion-oauth-callback');

function redirectWithStatus(_request: NextRequest, returnTo: string, status: string): NextResponse {
  const redirectUrl = new URL(
    buildCanonicalInternalUrl({ fallbackPath: '/integrations', path: returnTo }),
  );

  redirectUrl.searchParams.set('notion', status);

  return NextResponse.redirect(redirectUrl);
}

function getFallbackRedirect(request: NextRequest, status: string): NextResponse {
  return redirectWithStatus(request, '/integrations', status);
}

export async function GET(request: NextRequest) {
  let env: ReturnType<typeof getNotionOAuthEnv>;

  try {
    env = getNotionOAuthEnv();
  } catch {
    return getFallbackRedirect(request, 'not-configured');
  }

  const rawState = request.nextUrl.searchParams.get('state');
  const state = rawState
    ? parseNotionOAuthState({
        secret: env.NOTION_OAUTH_CLIENT_SECRET,
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
    const token = await exchangeNotionOAuthCode({
      clientId: env.NOTION_OAUTH_CLIENT_ID,
      clientSecret: env.NOTION_OAUTH_CLIENT_SECRET,
      code,
      redirectUri: env.NOTION_REDIRECT_URI,
    });
    const pages = await listSharedNotionPages({
      accessToken: token.accessToken,
    });
    const resources: NotionSourceResource[] = pages.map((page) => ({
      externalId: page.externalId,
      title: page.title,
      type: 'page',
      ...(page.lastEditedTime ? { lastEditedTime: page.lastEditedTime } : {}),
      ...(page.url ? { url: page.url } : {}),
    }));
    const source = await upsertNotionSourceForWorkspaceIndex({
      resources,
      workspaceId: token.workspaceId,
      workspaceIndexId: state.workspaceIndexId,
      ...(token.workspaceName ? { workspaceName: token.workspaceName } : {}),
    });

    if (!source) {
      return redirectWithStatus(request, state.returnTo, 'workspace-not-found');
    }

    await upsertSourceCredential({
      accessToken: token.accessToken,
      accountId: token.botId,
      accountName: token.workspaceName,
      provider: 'notion',
      refreshToken: token.refreshToken,
      sourceId: source.id,
    });

    return redirectWithStatus(request, state.returnTo, 'connected');
  } catch (callbackError: unknown) {
    if (callbackError instanceof SourceAdapterError) {
      logger.error('Notion OAuth callback failed with provider error.', callbackError, {
        code: callbackError.code,
        workspaceIndexId: state.workspaceIndexId,
      });
    } else {
      logger.error('Notion OAuth callback failed unexpectedly.', callbackError, {
        workspaceIndexId: state.workspaceIndexId,
      });
    }

    return redirectWithStatus(request, state.returnTo, 'failed');
  }
}
