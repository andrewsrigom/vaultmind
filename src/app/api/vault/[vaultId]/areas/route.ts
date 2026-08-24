import { createWorkspaceArea } from '@/db/queries/workspace-areas';
import { parseJsonRequestBody, parseRouteParams } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireVaultDocsManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import {
  createWorkspaceAreaRequestSchema,
  vaultWorkspaceAreaRouteParamsSchema,
} from '@/lib/validators/workspace-area';

import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceAreaRouteParams } from '@/lib/validators/workspace-area';
import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-areas-api');

export async function POST(
  request: NextRequest,
  context: RouteContext<VaultWorkspaceAreaRouteParams>,
) {
  const params = await parseRouteParams(context, vaultWorkspaceAreaRouteParamsSchema);

  if (!params) {
    return apiError('invalid-input', 'Vault ID must be a UUID.', 400);
  }

  const access = await requireVaultDocsManagementForRequest({
    request,
    vaultId: params.vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, createWorkspaceAreaRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const area = await createWorkspaceArea({
      name: parsedBody.data.name,
      vaultId: params.vaultId,
    });

    return apiSuccess({ area }, 201);
  } catch (error: unknown) {
    logger.error('Failed to create workspace area.', error, params);

    return apiUnexpectedError('Could not create space.');
  }
}
