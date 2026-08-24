import {
  deleteWorkspaceIndex,
  getWorkspaceIndexDetail,
  updateWorkspaceIndexMetadata,
} from '@/db/queries/workspace-indexes';
import { parseWorkspaceIndexIdParam, readJsonBody } from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import {
  requireSourceManagementForRequest,
  requireSourceReadForRequest,
} from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { getZodErrorMessage, updateWorkspaceIndexSchema } from '@/lib/validators/workspace-index';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const logger = createLogger('workspace-index-api');

export async function DELETE(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const deleted = await deleteWorkspaceIndex(workspaceIndexId);

    if (!deleted) {
      return apiError('not-found', 'Workspace index was not found.', 404);
    }

    return apiSuccess({});
  } catch (error: unknown) {
    logger.error('Failed to delete workspace index.', error, { workspaceIndexId });

    return apiDatabaseError('Could not delete the workspace index.');
  }
}

export async function GET(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireSourceReadForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const detail = await getWorkspaceIndexDetail(workspaceIndexId);

    if (!detail) {
      return apiError('not-found', 'Workspace index was not found.', 404);
    }

    return apiSuccess({ detail });
  } catch (error: unknown) {
    logger.error('Failed to load workspace index.', error, { workspaceIndexId });

    return apiDatabaseError('Could not load the workspace index.');
  }
}

export async function PATCH(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  const body = await readJsonBody(request);
  const parsedBody = updateWorkspaceIndexSchema.safeParse(body);

  if (!parsedBody.success) {
    return apiError('invalid-input', getZodErrorMessage(parsedBody.error), 400);
  }

  try {
    const workspaceIndex = await updateWorkspaceIndexMetadata(workspaceIndexId, parsedBody.data);

    if (!workspaceIndex) {
      return apiError('not-found', 'Workspace index was not found.', 404);
    }

    return apiSuccess({ workspaceIndex });
  } catch (error: unknown) {
    logger.error('Failed to update workspace index.', error, { workspaceIndexId });

    return apiDatabaseError('Could not update the workspace index.');
  }
}
