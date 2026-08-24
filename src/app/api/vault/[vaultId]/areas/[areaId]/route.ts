import { updateWorkspaceArea } from '@/db/queries/workspace-areas';
import { parseJsonRequestBody, parseRouteParams } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireVaultDocsManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import {
  updateWorkspaceAreaRequestSchema,
  workspaceAreaRouteParamsSchema,
} from '@/lib/validators/workspace-area';

import type { RouteContext } from '@/lib/api/request';
import type { WorkspaceAreaRouteParams } from '@/lib/validators/workspace-area';
import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-area-api');

export async function PATCH(request: NextRequest, context: RouteContext<WorkspaceAreaRouteParams>) {
  const params = await parseRouteParams(context, workspaceAreaRouteParamsSchema);

  if (!params) {
    return apiError('invalid-input', 'Vault ID and area ID must be UUIDs.', 400);
  }

  const access = await requireVaultDocsManagementForRequest({
    request,
    vaultId: params.vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, updateWorkspaceAreaRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const area = await updateWorkspaceArea({
      description: parsedBody.data.description,
      icon: parsedBody.data.icon,
      name: parsedBody.data.name,
      vaultId: params.vaultId,
      workspaceAreaId: params.areaId,
    });

    if (!area) {
      return apiError('not-found', 'Area was not found for this vault.', 404);
    }

    return apiSuccess({ area });
  } catch (error: unknown) {
    logger.error('Failed to update workspace area.', error, params);

    return apiUnexpectedError('Could not update area.');
  }
}
