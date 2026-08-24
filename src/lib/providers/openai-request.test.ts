import { describe, expect, it } from 'vitest';

import {
  isTransientOpenAIError,
  retryTransientOpenAIRequest,
} from '@/lib/providers/openai-request';

describe('isTransientOpenAIError', () => {
  it('treats aborts and retryable HTTP statuses as transient', () => {
    expect(isTransientOpenAIError({ name: 'AbortError' })).toBe(true);
    expect(isTransientOpenAIError({ status: 429 })).toBe(true);
    expect(isTransientOpenAIError({ status: 503 })).toBe(true);
  });

  it('ignores non-retryable errors', () => {
    expect(isTransientOpenAIError({ status: 400 })).toBe(false);
    expect(isTransientOpenAIError(new Error('bad request'))).toBe(false);
  });
});

describe('retryTransientOpenAIRequest', () => {
  it('retries transient errors before returning a successful result', async () => {
    let attempts = 0;

    await expect(
      retryTransientOpenAIRequest({
        maxRetries: 2,
        operation: async () => {
          attempts += 1;

          if (attempts === 1) {
            throw { status: 503 };
          }

          return 'ok';
        },
        retryDelayMs: 0,
      }),
    ).resolves.toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does not retry non-transient errors', async () => {
    let attempts = 0;
    const error = { status: 400 };

    await expect(
      retryTransientOpenAIRequest({
        maxRetries: 2,
        operation: async () => {
          attempts += 1;
          throw error;
        },
        retryDelayMs: 0,
      }),
    ).rejects.toBe(error);
    expect(attempts).toBe(1);
  });
});
