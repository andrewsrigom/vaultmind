import { deleteChatSession, getChatSessionById, updateChatSessionTitle } from '@/db/queries/chat';
import { parseChatSessionIdParam, parseJsonRequestBody } from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import {
  requireApiAccessForRequest,
  requireWorkspaceIndexDocsManagementForRequest,
} from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { updateChatSessionSchema } from '@/lib/validators/chat';

import type { NextRequest } from 'next/server';
import type { ChatSessionRouteContext } from '@/lib/api/request';

const logger = createLogger('chat-session-api');

async function requireChatSessionManagement(request: NextRequest, chatSessionId: string) {
  const auth = await requireApiAccessForRequest(request);

  if (!auth.ok) {
    return auth;
  }

  const chatSession = await getChatSessionById({ chatSessionId });

  if (!chatSession) {
    return {
      ok: false as const,
      response: apiError('not-found', 'Chat session was not found.', 404),
    };
  }

  return requireWorkspaceIndexDocsManagementForRequest({
    request,
    workspaceIndexId: chatSession.workspaceIndexId,
  });
}

export async function DELETE(request: NextRequest, context: ChatSessionRouteContext) {
  const chatSessionId = await parseChatSessionIdParam(context);

  if (!chatSessionId) {
    return apiError('invalid-input', 'Chat session ID must be a UUID.', 400);
  }

  const access = await requireChatSessionManagement(request, chatSessionId);

  if (!access.ok) {
    return access.response;
  }

  try {
    const chatSession = await deleteChatSession({ chatSessionId });

    if (!chatSession) {
      return apiError('not-found', 'Chat session was not found.', 404);
    }

    return apiSuccess({ chatSession });
  } catch (error: unknown) {
    logger.error('Failed to delete chat session.', error, { chatSessionId });

    return apiDatabaseError('Could not delete the chat session.');
  }
}

export async function PATCH(request: NextRequest, context: ChatSessionRouteContext) {
  const chatSessionId = await parseChatSessionIdParam(context);

  if (!chatSessionId) {
    return apiError('invalid-input', 'Chat session ID must be a UUID.', 400);
  }

  const access = await requireChatSessionManagement(request, chatSessionId);

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, updateChatSessionSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const input: Parameters<typeof updateChatSessionTitle>[0] = {
      chatSessionId,
    };

    if (parsedBody.data.title !== undefined) {
      input.title = parsedBody.data.title;
    }

    if (parsedBody.data.isPinned !== undefined) {
      input.isPinned = parsedBody.data.isPinned;
    }

    const chatSession = await updateChatSessionTitle(input);

    if (!chatSession) {
      return apiError('not-found', 'Chat session was not found.', 404);
    }

    return apiSuccess({ chatSession });
  } catch (error: unknown) {
    logger.error('Failed to update chat session.', error, { chatSessionId });

    return apiDatabaseError('Could not update the chat session.');
  }
}
