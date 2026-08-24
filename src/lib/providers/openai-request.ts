import { sleep } from '@/lib/async';

type RetryTransientOpenAIRequestInput<TValue> = {
  maxRetries: number;
  operation: () => Promise<TValue>;
  retryDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
};

const transientOpenAIStatuses = new Set([408, 429, 500, 502, 503, 504]);

function getErrorName(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('name' in error)) {
    return null;
  }

  const name = error.name;

  return typeof name === 'string' ? name : null;
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return null;
  }

  const status = error.status;

  return typeof status === 'number' ? status : null;
}

export function isTransientOpenAIError(error: unknown): boolean {
  if (getErrorName(error) === 'AbortError') {
    return true;
  }

  const status = getErrorStatus(error);

  return status !== null && transientOpenAIStatuses.has(status);
}

export async function retryTransientOpenAIRequest<TValue>({
  maxRetries,
  operation,
  retryDelayMs,
  shouldRetry = isTransientOpenAIError,
}: RetryTransientOpenAIRequestInput<TValue>): Promise<TValue> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      if (attempt < maxRetries && shouldRetry(error)) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw error;
    }
  }

  throw new Error('OpenAI retry loop exhausted unexpectedly.');
}
