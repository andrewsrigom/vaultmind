import { parseJsonRequestBody, parseWorkspaceIndexIdParam } from '@/lib/api/request';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { createEventStreamResponse } from '@/lib/api/stream';
import { requireSourceManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { syncWorkspaceSource, SyncWorkspaceSourceError } from '@/lib/rag/sync-knowledge-source';
import { syncRequestSchema } from '@/lib/validators/sync';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';
import type { SyncWorkspaceSourceProgress } from '@/lib/rag/sync-knowledge-source';

const logger = createLogger('workspace-index-sync-api');

function getStreamErrorMessage(error: unknown, workspaceIndexId: string): string {
  if (error instanceof SyncWorkspaceSourceError) {
    return error.message;
  }

  logger.error('Failed to stream workspace index sync.', error, { workspaceIndexId });

  return 'Sync failed unexpectedly. Check the source settings and try again.';
}

function createSyncStreamResponse({
  sourceId,
  workspaceIndexId,
}: {
  workspaceIndexId: string;
  sourceId?: string;
}): Response {
  return createEventStreamResponse(async (send) => {
    try {
      const result = await syncWorkspaceSource({
        workspaceIndexId,
        ...(sourceId ? { sourceId } : {}),
        onProgress: (progress: SyncWorkspaceSourceProgress) => {
          send('progress', progress);
        },
      });

      send('done', result);
    } catch (error: unknown) {
      send('error', {
        message: getStreamErrorMessage(error, workspaceIndexId),
      });
    }
  });
}

export async function POST(request: NextRequest, context: WorkspaceIndexRouteContext) {
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

  const parsedBody = await parseJsonRequestBody(request, syncRequestSchema, {
    fallbackBody: {},
  });

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    if (parsedBody.data.stream) {
      return createSyncStreamResponse({
        workspaceIndexId,
        ...(parsedBody.data.sourceId ? { sourceId: parsedBody.data.sourceId } : {}),
      });
    }

    const result = await syncWorkspaceSource({
      workspaceIndexId,
      ...(parsedBody.data.sourceId ? { sourceId: parsedBody.data.sourceId } : {}),
    });

    return apiSuccess(result);
  } catch (error: unknown) {
    if (error instanceof SyncWorkspaceSourceError) {
      return apiError(error.code, error.message, error.status);
    }

    logger.error('Failed to sync workspace index.', error, { workspaceIndexId });

    return apiError(
      'unexpected-error',
      'Sync failed unexpectedly. Check the source settings and try again.',
      500,
    );
  }
}
