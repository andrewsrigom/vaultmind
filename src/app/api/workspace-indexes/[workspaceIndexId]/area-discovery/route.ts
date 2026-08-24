import { createAreaDiscoveryRun, listAreaDiscoveryRuns } from '@/db/queries/area-discovery';
import { parseWorkspaceIndexIdParam } from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import {
  requireAnalyticsManagementForRequest,
  requireAnalyticsReadForRequest,
} from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { AreaDiscoveryError, runAreaDiscovery } from '@/lib/rag/discover-knowledge-areas';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const logger = createLogger('workspace-index-area-discovery-api');

export async function GET(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireAnalyticsReadForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const areaDiscoveryRuns = await listAreaDiscoveryRuns({ workspaceIndexId });

    return apiSuccess({ areaDiscoveryRuns });
  } catch (error: unknown) {
    logger.error('Failed to list area discovery runs.', error, { workspaceIndexId });

    return apiDatabaseError('Could not load area discovery runs.');
  }
}

export async function POST(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireAnalyticsManagementForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const areaDiscoveryRun = await createAreaDiscoveryRun({ workspaceIndexId });

    if (!areaDiscoveryRun) {
      return apiError('not-found', 'Workspace index was not found.', 404);
    }

    const detail = await runAreaDiscovery({
      runId: areaDiscoveryRun.id,
      workspaceIndexId,
    });

    return apiSuccess({ detail }, 201);
  } catch (error: unknown) {
    if (error instanceof AreaDiscoveryError) {
      return apiError(error.code, error.message, error.status);
    }

    logger.error('Failed to run area discovery.', error, { workspaceIndexId });

    return apiError(
      'unexpected-error',
      'Area discovery failed unexpectedly. Try again after confirming documents are synced.',
      500,
    );
  }
}
