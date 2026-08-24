import { setWorkspaceDocFavorite } from '@/db/queries/workspace-docs';
import { parseJsonRequestBody, parseRouteParams } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireVaultDocsManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import {
  favoriteWorkspaceDocRequestSchema,
  vaultWorkspaceDocDetailRouteParamsSchema,
} from '@/lib/validators/workspace-doc';

import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';
import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-doc-favorite-api');

export async function PATCH(
  request: NextRequest,
  context: RouteContext<VaultWorkspaceDocDetailRouteParams>,
) {
  const params = await parseRouteParams(context, vaultWorkspaceDocDetailRouteParamsSchema);

  if (!params) {
    return apiError('invalid-input', 'Vault ID and doc ID must be UUIDs.', 400);
  }

  const access = await requireVaultDocsManagementForRequest({
    request,
    vaultId: params.vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, favoriteWorkspaceDocRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const doc = await setWorkspaceDocFavorite({
      docId: params.docId,
      isFavorite: parsedBody.data.isFavorite,
      vaultId: params.vaultId,
    });

    if (!doc) {
      return apiError('not-found', 'Doc was not found.', 404);
    }

    return apiSuccess({ doc });
  } catch (error: unknown) {
    logger.error('Failed to update workspace doc favorite state.', error, params);

    return apiUnexpectedError('Could not update favorite state.');
  }
}
