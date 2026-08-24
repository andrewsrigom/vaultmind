import {
  getAreaDiscoveryRunDetail,
  updatePendingAreaDiscoveryRunSuggestionsStatus,
} from '@/db/queries/area-discovery';
import { parseWorkspaceIndexAreaDiscoveryParams, readJsonBody } from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import {
  requireAnalyticsManagementForRequest,
  requireAnalyticsReadForRequest,
} from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { updateAreaSuggestionStatusSchema } from '@/lib/validators/area-discovery';
import { getZodErrorMessage } from '@/lib/validators/workspace-index';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexAreaDiscoveryRouteContext } from '@/lib/api/request';

const logger = createLogger('workspace-index-area-discovery-detail-api');

export async function GET(request: NextRequest, context: WorkspaceIndexAreaDiscoveryRouteContext) {
  const params = await parseWorkspaceIndexAreaDiscoveryParams(context);

  if (!params) {
    return apiError('invalid-input', 'Workspace index ID and discovery run ID must be UUIDs.', 400);
  }

  const access = await requireAnalyticsReadForRequest({
    request,
    workspaceIndexId: params.workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const detail = await getAreaDiscoveryRunDetail({
      runId: params.areaDiscoveryRunId,
      workspaceIndexId: params.workspaceIndexId,
    });

    if (!detail) {
      return apiError('not-found', 'Area discovery run was not found.', 404);
    }

    return apiSuccess({ detail });
  } catch (error: unknown) {
    logger.error('Failed to load area discovery run.', error, params);

    return apiDatabaseError('Could not load area discovery run.');
  }
}

export async function PATCH(
  request: NextRequest,
  context: WorkspaceIndexAreaDiscoveryRouteContext,
) {
  const params = await parseWorkspaceIndexAreaDiscoveryParams(context);

  if (!params) {
    return apiError('invalid-input', 'Workspace index ID and discovery run ID must be UUIDs.', 400);
  }

  const access = await requireAnalyticsManagementForRequest({
    request,
    workspaceIndexId: params.workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  const body = await readJsonBody(request);
  const parsedBody = updateAreaSuggestionStatusSchema.safeParse(body);

  if (!parsedBody.success) {
    return apiError('invalid-input', getZodErrorMessage(parsedBody.error), 400);
  }

  try {
    const detail = await getAreaDiscoveryRunDetail({
      runId: params.areaDiscoveryRunId,
      workspaceIndexId: params.workspaceIndexId,
    });

    if (!detail) {
      return apiError('not-found', 'Area discovery run was not found.', 404);
    }

    const suggestions = await updatePendingAreaDiscoveryRunSuggestionsStatus({
      runId: params.areaDiscoveryRunId,
      status: parsedBody.data.status,
      workspaceIndexId: params.workspaceIndexId,
    });

    return apiSuccess({ suggestions });
  } catch (error: unknown) {
    logger.error('Failed to update area discovery suggestions.', error, params);

    return apiDatabaseError('Could not update area discovery suggestions.');
  }
}
