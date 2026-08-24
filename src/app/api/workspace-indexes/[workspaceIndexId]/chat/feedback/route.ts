import { createTrustSignalEvent } from '@/db/queries/knowledge-events';
import { parseWorkspaceIndexIdParam, readJsonBody } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireWorkspaceIndexDocsReadForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { trustSignalRequestSchema } from '@/lib/validators/knowledge-event';
import { getZodErrorMessage } from '@/lib/validators/workspace-index';

import type { WorkspaceIndexRouteContext } from '@/lib/api/request';
import type { NextRequest } from 'next/server';

const logger = createLogger('chat-feedback-api');

export async function POST(request: NextRequest, context: WorkspaceIndexRouteContext) {
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

  const body = await readJsonBody(request);
  const parsedBody = trustSignalRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return apiError('invalid-input', getZodErrorMessage(parsedBody.error), 400);
  }

  try {
    const result = await createTrustSignalEvent({
      chatMessageId: parsedBody.data.chatMessageId,
      signal: parsedBody.data.signal,
      workspaceAreaId: parsedBody.data.workspaceAreaId ?? null,
      workspaceIndexId,
    });

    if (result.status === 'not-created') {
      if (result.reason === 'message-not-assistant') {
        return apiError('invalid-input', 'Only assistant messages can receive feedback.', 400);
      }

      if (result.reason === 'area-not-found') {
        return apiError('not-found', 'Area was not found for this vault.', 404);
      }

      return apiError('not-found', 'Assistant message was not found for this scope.', 404);
    }

    return apiSuccess({ event: result.event }, 201);
  } catch (error: unknown) {
    logger.error('Failed to submit chat feedback.', error, { workspaceIndexId });

    return apiUnexpectedError('Could not save feedback.');
  }
}
