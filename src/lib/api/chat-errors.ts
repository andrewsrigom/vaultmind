import { ChatSessionNotFoundError } from '@/db/queries/chat';
import { toChatProviderApiError, toEmbeddingProviderApiError } from '@/lib/api/provider-errors';
import { apiError } from '@/lib/api/responses';
import { ChatProviderError } from '@/lib/providers/chat-provider';
import { EmbeddingProviderError } from '@/lib/providers/embedding-provider';

import type { ApiErrorResponse } from '@/lib/api/responses';
import type { createLogger } from '@/lib/logger';
import type { NextResponse } from 'next/server';

const defaultChatFailureMessage =
  'Chat answer failed unexpectedly. Try again after confirming documents are synced.';

type ChatErrorLogInput = {
  error: unknown;
  fallbackMessage?: string;
  logger: ReturnType<typeof createLogger>;
  logContext: Record<string, unknown>;
  logMessage: string;
};

export function getChatStreamErrorMessage({
  error,
  fallbackMessage = defaultChatFailureMessage,
  logContext,
  logger,
  logMessage,
}: ChatErrorLogInput): string {
  if (error instanceof ChatProviderError) {
    return error.message;
  }

  logger.error(logMessage, error, logContext);

  return fallbackMessage;
}

export function toChatApiErrorResponse({
  error,
  fallbackMessage = defaultChatFailureMessage,
  logContext,
  logger,
  logMessage,
}: ChatErrorLogInput): NextResponse<ApiErrorResponse> {
  if (error instanceof ChatSessionNotFoundError) {
    return apiError('not-found', 'Chat session was not found.', 404);
  }

  if (error instanceof ChatProviderError) {
    return toChatProviderApiError(error);
  }

  if (error instanceof EmbeddingProviderError) {
    return toEmbeddingProviderApiError(error);
  }

  logger.error(logMessage, error, logContext);

  return apiError('unexpected-error', fallbackMessage, 500);
}
