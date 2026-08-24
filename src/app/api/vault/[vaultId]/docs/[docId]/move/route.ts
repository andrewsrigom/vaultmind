import { moveWorkspaceDoc } from '@/db/queries/workspace-docs';
import { parseJsonRequestBody, parseRouteParams } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireVaultDocsManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import {
  moveWorkspaceDocRequestSchema,
  vaultWorkspaceDocDetailRouteParamsSchema,
} from '@/lib/validators/workspace-doc';

import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';
import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-doc-move-api');

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

  const parsedBody = await parseJsonRequestBody(request, moveWorkspaceDocRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const doc = await moveWorkspaceDoc({
      docId: params.docId,
      parentDocId: parsedBody.data.parentDocId,
      vaultId: params.vaultId,
      workspaceAreaId: parsedBody.data.workspaceAreaId,
    });

    if (!doc) {
      return apiError('invalid-input', 'Move target is not valid for this doc.', 400);
    }

    return apiSuccess({ doc });
  } catch (error: unknown) {
    logger.error('Failed to move workspace doc.', error, params);

    return apiUnexpectedError('Could not move doc.');
  }
}
