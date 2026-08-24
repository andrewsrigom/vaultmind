import { describe, expect, it } from 'vitest';

import {
  EmbeddingProviderError,
  expectedEmbeddingDimensions,
} from '@/lib/providers/embedding-provider';
import { createOpenAIEmbeddingProvider } from '@/lib/providers/openai-embedding-provider';
import { createEmbedding } from '@/lib/rag/create-embedding';

import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';

class StaticEmbeddingProvider implements EmbeddingProvider {
  dimensions: number;
  model = 'test-model';
  vector: number[];

  constructor(vector: number[]) {
    this.dimensions = vector.length;
    this.vector = vector;
  }

  async createEmbedding(): Promise<number[]> {
    return this.vector;
  }
}

describe('createEmbedding', () => {
  it('returns embeddings with the expected dimensions', async () => {
    const vector = Array.from({ length: expectedEmbeddingDimensions }, () => 0);

    await expect(createEmbedding('note', new StaticEmbeddingProvider(vector))).resolves.toEqual(
      vector,
    );
  });

  it('rejects embeddings with unexpected dimensions', async () => {
    await expect(createEmbedding('note', new StaticEmbeddingProvider([0, 1]))).rejects.toThrow(
      EmbeddingProviderError,
    );
  });
});

describe('createOpenAIEmbeddingProvider', () => {
  it('fails clearly when configured with an unsupported embedding model', () => {
    expect(() =>
      createOpenAIEmbeddingProvider({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
      }),
    ).toThrow(EmbeddingProviderError);
  });
});
