import { updateAreaSuggestionStatus } from '@/db/queries/area-discovery';
import { parseWorkspaceIndexAreaSuggestionParams, readJsonBody } from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import { requireAnalyticsManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { updateAreaSuggestionStatusSchema } from '@/lib/validators/area-discovery';
import { getZodErrorMessage } from '@/lib/validators/workspace-index';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexAreaSuggestionRouteContext } from '@/lib/api/request';

const logger = createLogger('workspace-index-area-suggestion-api');

export async function PATCH(
  request: NextRequest,
  context: WorkspaceIndexAreaSuggestionRouteContext,
) {
  const params = await parseWorkspaceIndexAreaSuggestionParams(context);

  if (!params) {
    return apiError(
      'invalid-input',
      'Workspace index ID and area suggestion ID must be UUIDs.',
      400,
    );
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
    const suggestion = await updateAreaSuggestionStatus({
      status: parsedBody.data.status,
      suggestionId: params.areaSuggestionId,
      workspaceIndexId: params.workspaceIndexId,
    });

    if (!suggestion) {
      return apiError('not-found', 'Area suggestion was not found.', 404);
    }

    return apiSuccess({ suggestion });
  } catch (error: unknown) {
    logger.error('Failed to update area suggestion.', error, params);

    return apiDatabaseError('Could not update area suggestion.');
  }
}
