import { describe, expect, it } from 'vitest';

import { toChatProviderApiError, toEmbeddingProviderApiError } from '@/lib/api/provider-errors';
import { ChatProviderError } from '@/lib/providers/chat-provider';
import { EmbeddingProviderError } from '@/lib/providers/embedding-provider';

import type { ApiErrorResponse } from '@/lib/api/responses';

async function readApiError(response: Response): Promise<ApiErrorResponse> {
  return (await response.json()) as ApiErrorResponse;
}

describe('toChatProviderApiError', () => {
  it('maps chat provider errors to stable API statuses', async () => {
    const configResponse = toChatProviderApiError(
      new ChatProviderError('chat-config-error', 'Missing chat provider config.'),
    );
    const providerResponse = toChatProviderApiError(
      new ChatProviderError('chat-provider-error', 'Chat provider failed.'),
    );

    await expect(readApiError(configResponse)).resolves.toMatchObject({
      error: {
        code: 'chat-config-error',
        message: 'Missing chat provider config.',
      },
    });
    await expect(readApiError(providerResponse)).resolves.toMatchObject({
      error: {
        code: 'chat-provider-error',
        message: 'Chat provider failed.',
      },
    });
    expect(configResponse.status).toBe(500);
    expect(providerResponse.status).toBe(502);
  });
});

describe('toEmbeddingProviderApiError', () => {
  it('maps embedding provider errors to stable API statuses', async () => {
    const configResponse = toEmbeddingProviderApiError(
      new EmbeddingProviderError('embedding-config-error', 'Missing embedding config.'),
    );
    const dimensionResponse = toEmbeddingProviderApiError(
      new EmbeddingProviderError('embedding-dimension-mismatch', 'Wrong dimensions.'),
    );
    const providerResponse = toEmbeddingProviderApiError(
      new EmbeddingProviderError('embedding-provider-error', 'Embedding provider failed.'),
    );

    await expect(readApiError(configResponse)).resolves.toMatchObject({
      error: {
        code: 'embedding-config-error',
        message: 'Missing embedding config.',
      },
    });
    await expect(readApiError(dimensionResponse)).resolves.toMatchObject({
      error: {
        code: 'embedding-dimension-mismatch',
        message: 'Wrong dimensions.',
      },
    });
    await expect(readApiError(providerResponse)).resolves.toMatchObject({
      error: {
        code: 'embedding-provider-error',
        message: 'Embedding provider failed.',
      },
    });
    expect(configResponse.status).toBe(500);
    expect(dimensionResponse.status).toBe(500);
    expect(providerResponse.status).toBe(502);
  });

  it('allows route-specific embedding messages and statuses', async () => {
    const response = toEmbeddingProviderApiError(
      new EmbeddingProviderError('embedding-config-error', 'Missing embedding config.'),
      {
        configMessage: 'Set OPENAI_API_KEY before indexing documents.',
        configStatus: 502,
      },
    );

    await expect(readApiError(response)).resolves.toMatchObject({
      error: {
        code: 'embedding-config-error',
        message: 'Set OPENAI_API_KEY before indexing documents.',
      },
    });
    expect(response.status).toBe(502);
  });
});
