import { listWorkspaceIndexDocuments } from '@/db/queries/documents';
import { getWorkspaceIndexDetail } from '@/db/queries/workspace-indexes';
import { parseWorkspaceIndexIdParam } from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import { requireWorkspaceIndexDocsReadForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const logger = createLogger('workspace-index-documents-api');

export async function GET(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireWorkspaceIndexDocsReadForRequest({
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

    const documents = await listWorkspaceIndexDocuments({ workspaceIndexId });

    return apiSuccess({ documents });
  } catch (error: unknown) {
    logger.error('Failed to load workspace index documents.', error, { workspaceIndexId });

    return apiDatabaseError('Could not load documents.');
  }
}
