import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiError } from '@/lib/api/responses';
import { requireSourceManagementForRequest } from '@/lib/access/api-access';
import { getNotionOAuthEnv } from '@/lib/env';
import { createNotionOAuthState } from '@/lib/sources/notion/oauth-state';

import type { NextRequest } from 'next/server';

const notionAuthorizeUrl = 'https://api.notion.com/v1/oauth/authorize';

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

  let env: ReturnType<typeof getNotionOAuthEnv>;

  try {
    env = getNotionOAuthEnv();
  } catch {
    return apiError(
      'notion-oauth-not-configured',
      'Set NOTION_OAUTH_CLIENT_ID, NOTION_OAUTH_CLIENT_SECRET, and NOTION_REDIRECT_URI before connecting Notion.',
      500,
    );
  }

  const state = createNotionOAuthState({
    returnTo: parsedParams.data.returnTo,
    secret: env.NOTION_OAUTH_CLIENT_SECRET,
    workspaceIndexId: parsedParams.data.workspaceIndexId,
  });
  const authorizationUrl = new URL(notionAuthorizeUrl);

  authorizationUrl.searchParams.set('client_id', env.NOTION_OAUTH_CLIENT_ID);
  authorizationUrl.searchParams.set('owner', 'user');
  authorizationUrl.searchParams.set('redirect_uri', env.NOTION_REDIRECT_URI);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('state', state);

  return NextResponse.redirect(authorizationUrl);
}
