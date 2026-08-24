import { createEventStreamResponse } from '@/lib/api/stream';
import { streamPreparedAnswer } from '@/lib/rag/generate-answer';

import type { GenerateAnswerResult, PreparedChatAnswer } from '@/lib/rag/generate-answer';

export function toChatResponseBody(result: GenerateAnswerResult) {
  return {
    answer: result.answer,
    chatSessionId: result.chatSessionId,
    messages: {
      assistant: result.assistantMessage,
      user: result.userMessage,
    },
    sources: result.sources,
    workspaceIndexId: result.workspaceIndexId,
  };
}

type CreatePreparedChatStreamResponseInput = {
  getErrorMessage: (error: unknown) => string;
  prepared: PreparedChatAnswer;
};

export function createPreparedChatStreamResponse({
  getErrorMessage,
  prepared,
}: CreatePreparedChatStreamResponseInput): Response {
  return createEventStreamResponse(async (send) => {
    try {
      send('session', {
        chatSessionId: prepared.chatSessionId,
        message: prepared.userMessage,
      });
      send('sources', {
        sources: prepared.sources,
      });

      const result = await streamPreparedAnswer({
        onToken: (token) => {
          send('token', { token });
        },
        prepared,
      });

      send('done', toChatResponseBody(result));
    } catch (error: unknown) {
      send('error', {
        message: getErrorMessage(error),
      });
    }
  });
}
