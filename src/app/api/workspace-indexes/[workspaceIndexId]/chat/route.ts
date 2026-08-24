import { getWorkspaceIndexDetail } from '@/db/queries/workspace-indexes';
import { getChatStreamErrorMessage, toChatApiErrorResponse } from '@/lib/api/chat-errors';
import { createPreparedChatStreamResponse, toChatResponseBody } from '@/lib/api/chat-stream';
import { parseJsonRequestBody, parseWorkspaceIndexIdParam } from '@/lib/api/request';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { requireWorkspaceIndexDocsReadForRequest } from '@/lib/access/api-access';
import { getLocale } from '@/lib/i18n-server';
import { createLogger } from '@/lib/logger';
import { generateAnswer, prepareChatAnswer } from '@/lib/rag/generate-answer';
import { chatRequestSchema } from '@/lib/validators/chat';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';
import type { GenerateAnswerInput } from '@/lib/rag/generate-answer';

const logger = createLogger('workspace-index-chat-api');

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

  const parsedBody = await parseJsonRequestBody(request, chatRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const detail = await getWorkspaceIndexDetail(workspaceIndexId);

    if (!detail) {
      return apiError('not-found', 'Workspace index was not found.', 404);
    }

    const answerInput: GenerateAnswerInput = {
      answerLanguage: await getLocale(),
      question: parsedBody.data.message,
      workspaceIndexId,
    };

    if (parsedBody.data.chatSessionId) {
      answerInput.chatSessionId = parsedBody.data.chatSessionId;
    }

    if (parsedBody.data.stream) {
      const prepared = await prepareChatAnswer(answerInput);

      return createPreparedChatStreamResponse({
        getErrorMessage: (error) =>
          getChatStreamErrorMessage({
            error,
            logContext: { workspaceIndexId },
            logger,
            logMessage: 'Failed to stream chat answer.',
          }),
        prepared,
      });
    }

    const result = await generateAnswer(answerInput);

    return apiSuccess(toChatResponseBody(result));
  } catch (error: unknown) {
    return toChatApiErrorResponse({
      error,
      logContext: { workspaceIndexId },
      logger,
      logMessage: 'Failed to generate chat answer.',
    });
  }
}
