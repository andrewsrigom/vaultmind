import { archiveWorkspaceDoc, restoreWorkspaceDoc } from '@/db/queries/workspace-docs';
import { parseRouteParams } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireVaultDocsManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { vaultWorkspaceDocDetailRouteParamsSchema } from '@/lib/validators/workspace-doc';

import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';
import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-doc-archive-api');

export async function POST(
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

  try {
    const doc = await archiveWorkspaceDoc({
      docId: params.docId,
      vaultId: params.vaultId,
    });

    if (!doc) {
      return apiError('not-found', 'Doc was not found.', 404);
    }

    return apiSuccess({ doc });
  } catch (error: unknown) {
    logger.error('Failed to archive workspace doc.', error, params);

    return apiUnexpectedError('Could not archive doc.');
  }
}

export async function DELETE(
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

  try {
    const doc = await restoreWorkspaceDoc({
      docId: params.docId,
      vaultId: params.vaultId,
    });

    if (!doc) {
      return apiError('not-found', 'Doc was not found.', 404);
    }

    return apiSuccess({ doc });
  } catch (error: unknown) {
    logger.error('Failed to restore workspace doc.', error, params);

    return apiUnexpectedError('Could not restore doc.');
  }
}
