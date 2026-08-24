import { deleteWorkspaceSource } from '@/db/queries/workspace-indexes';
import { parseWorkspaceIndexSourceParams } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireSourceManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexSourceRouteContext } from '@/lib/api/request';

const logger = createLogger('workspace-index-source-api');

export async function DELETE(request: NextRequest, context: WorkspaceIndexSourceRouteContext) {
  const params = await parseWorkspaceIndexSourceParams(context);

  if (!params) {
    return apiError('invalid-input', 'Workspace index ID and source ID must be UUIDs.', 400);
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId: params.workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const source = await deleteWorkspaceSource({
      sourceId: params.sourceId,
      workspaceIndexId: params.workspaceIndexId,
    });

    if (!source) {
      return apiError('not-found', 'Source was not found for this workspace.', 404);
    }

    return apiSuccess({
      source: {
        id: source.id,
        name: source.name,
        type: source.type,
      },
    });
  } catch (error: unknown) {
    logger.error('Failed to delete workspace source.', error, params);

    return apiUnexpectedError('Could not delete this source.');
  }
}
