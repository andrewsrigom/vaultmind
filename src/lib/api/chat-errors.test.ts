import { describe, expect, it, vi } from 'vitest';

import { ChatSessionNotFoundError } from '@/db/queries/chat';
import { getChatStreamErrorMessage, toChatApiErrorResponse } from '@/lib/api/chat-errors';
import { ChatProviderError } from '@/lib/providers/chat-provider';
import { EmbeddingProviderError } from '@/lib/providers/embedding-provider';

import type { ApiErrorResponse } from '@/lib/api/responses';
import type { createLogger } from '@/lib/logger';

function createTestLogger(): ReturnType<typeof createLogger> {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

async function readApiError(response: Response): Promise<ApiErrorResponse> {
  return (await response.json()) as ApiErrorResponse;
}

describe('getChatStreamErrorMessage', () => {
  it('returns provider messages without logging', () => {
    const logger = createTestLogger();
    const message = getChatStreamErrorMessage({
      error: new ChatProviderError('chat-provider-error', 'Provider failed.'),
      logContext: { workspaceIndexId: 'workspace-id' },
      logger,
      logMessage: 'Failed to stream chat answer.',
    });

    expect(message).toBe('Provider failed.');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected stream errors and returns the fallback message', () => {
    const logger = createTestLogger();
    const message = getChatStreamErrorMessage({
      error: new Error('Unexpected stream failure.'),
      logContext: { workspaceIndexId: 'workspace-id' },
      logger,
      logMessage: 'Failed to stream chat answer.',
    });

    expect(message).toBe(
      'Chat answer failed unexpectedly. Try again after confirming documents are synced.',
    );
    expect(logger.error).toHaveBeenCalledWith('Failed to stream chat answer.', expect.any(Error), {
      workspaceIndexId: 'workspace-id',
    });
  });
});

describe('toChatApiErrorResponse', () => {
  it('maps known chat errors to stable API errors', async () => {
    const logger = createTestLogger();
    const notFoundResponse = toChatApiErrorResponse({
      error: new ChatSessionNotFoundError(),
      logContext: { workspaceIndexId: 'workspace-id' },
      logger,
      logMessage: 'Failed to generate chat answer.',
    });
    const providerResponse = toChatApiErrorResponse({
      error: new ChatProviderError('chat-provider-error', 'Provider failed.'),
      logContext: { workspaceIndexId: 'workspace-id' },
      logger,
      logMessage: 'Failed to generate chat answer.',
    });
    const embeddingResponse = toChatApiErrorResponse({
      error: new EmbeddingProviderError('embedding-provider-error', 'Embedding failed.'),
      logContext: { workspaceIndexId: 'workspace-id' },
      logger,
      logMessage: 'Failed to generate chat answer.',
    });

    await expect(readApiError(notFoundResponse)).resolves.toMatchObject({
      error: { code: 'not-found' },
    });
    await expect(readApiError(providerResponse)).resolves.toMatchObject({
      error: { code: 'chat-provider-error', message: 'Provider failed.' },
    });
    await expect(readApiError(embeddingResponse)).resolves.toMatchObject({
      error: { code: 'embedding-provider-error', message: 'Embedding failed.' },
    });
    expect(notFoundResponse.status).toBe(404);
    expect(providerResponse.status).toBe(502);
    expect(embeddingResponse.status).toBe(502);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected API errors and returns a generic response', async () => {
    const logger = createTestLogger();
    const response = toChatApiErrorResponse({
      error: new Error('Unexpected API failure.'),
      logContext: { vaultId: 'vault-id' },
      logger,
      logMessage: 'Failed to generate vault chat answer.',
    });

    await expect(readApiError(response)).resolves.toMatchObject({
      error: { code: 'unexpected-error' },
    });
    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to generate vault chat answer.',
      expect.any(Error),
      { vaultId: 'vault-id' },
    );
  });
});
