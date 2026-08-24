import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError } from '@/lib/api/responses';
import { requireSourceManagementForRequest } from '@/lib/access/api-access';
import { getGitHubOAuthEnv } from '@/lib/env';
import { githubOAuthReadScopes } from '@/lib/sources/github/github-oauth-api';
import { createGitHubOAuthState } from '@/lib/sources/github/oauth-state';

import type { NextRequest } from 'next/server';

const githubAuthorizeUrl = 'https://github.com/login/oauth/authorize';

const startSearchParamsSchema = z.object({
  returnTo: z.string().optional().default('/integrations'),
  sourceId: z.string().uuid(),
  workspaceIndexId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const parsedParams = startSearchParamsSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );

  if (!parsedParams.success) {
    return apiError('invalid-input', 'Workspace index ID and source ID must be UUIDs.', 400);
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId: parsedParams.data.workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  let env: ReturnType<typeof getGitHubOAuthEnv>;

  try {
    env = getGitHubOAuthEnv();
  } catch {
    return apiError(
      'github-oauth-not-configured',
      'Set GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, and GITHUB_REDIRECT_URI before connecting GitHub.',
      500,
    );
  }

  const state = createGitHubOAuthState({
    returnTo: parsedParams.data.returnTo,
    secret: env.GITHUB_OAUTH_CLIENT_SECRET,
    sourceId: parsedParams.data.sourceId,
    workspaceIndexId: parsedParams.data.workspaceIndexId,
  });
  const authorizationUrl = new URL(githubAuthorizeUrl);

  authorizationUrl.searchParams.set('allow_signup', 'true');
  authorizationUrl.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  authorizationUrl.searchParams.set('redirect_uri', env.GITHUB_REDIRECT_URI);
  authorizationUrl.searchParams.set('scope', githubOAuthReadScopes.join(' '));
  authorizationUrl.searchParams.set('state', state);

  return NextResponse.redirect(authorizationUrl);
}
