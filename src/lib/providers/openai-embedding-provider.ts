import OpenAI from 'openai';
import { z } from 'zod';

import { getOpenAIEnv } from '@/lib/env';
import { withAbortTimeout } from '@/lib/async';
import {
  EmbeddingProviderError,
  expectedEmbeddingDimensions,
  supportedEmbeddingModel,
  validateEmbeddingVector,
} from '@/lib/providers/embedding-provider';
import { retryTransientOpenAIRequest } from '@/lib/providers/openai-request';

import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { OpenAIEnv } from '@/lib/env';

type OpenAIEmbeddingProviderOptions = {
  apiKey?: string;
  maxRetries?: number;
  model?: string;
  timeoutMs?: number;
};

const defaultTimeoutMs = 30_000;
const retryDelayMs = 500;

function assertSupportedEmbeddingModel(model: string) {
  if (model !== supportedEmbeddingModel) {
    throw new EmbeddingProviderError(
      'embedding-config-error',
      `VaultMind supports ${supportedEmbeddingModel} embeddings with ${expectedEmbeddingDimensions} dimensions in the current schema.`,
    );
  }
}

function readOpenAIEnv(): OpenAIEnv {
  try {
    return getOpenAIEnv();
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new EmbeddingProviderError(
        'embedding-config-error',
        'Set OPENAI_API_KEY before syncing and embedding documents.',
      );
    }

    throw error;
  }
}

export function createOpenAIEmbeddingProvider(
  options: OpenAIEmbeddingProviderOptions = {},
): EmbeddingProvider {
  const env = options.apiKey && options.model ? null : readOpenAIEnv();
  const apiKey = options.apiKey ?? env?.OPENAI_API_KEY;
  const model = options.model ?? env?.OPENAI_EMBEDDING_MODEL ?? supportedEmbeddingModel;
  const maxRetries = options.maxRetries ?? 2;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

  if (!apiKey) {
    throw new EmbeddingProviderError(
      'embedding-config-error',
      'Set OPENAI_API_KEY before syncing and embedding documents.',
    );
  }

  assertSupportedEmbeddingModel(model);

  const client = new OpenAI({ apiKey });

  return {
    async createEmbedding(input: string): Promise<number[]> {
      try {
        const response = await retryTransientOpenAIRequest({
          maxRetries,
          operation: () =>
            withAbortTimeout(
              (signal) =>
                client.embeddings.create(
                  {
                    input,
                    model,
                  },
                  { signal },
                ),
              timeoutMs,
            ),
          retryDelayMs,
        });
        const [embedding] = response.data;

        if (!embedding) {
          throw new EmbeddingProviderError(
            'embedding-provider-error',
            'OpenAI did not return an embedding.',
          );
        }

        return validateEmbeddingVector(embedding.embedding);
      } catch (error: unknown) {
        if (error instanceof EmbeddingProviderError) {
          throw error;
        }

        throw new EmbeddingProviderError(
          'embedding-provider-error',
          'OpenAI embedding generation failed. Check network access and the configured OpenAI account, then try again.',
        );
      }
    },
    dimensions: expectedEmbeddingDimensions,
    model,
  };
}
