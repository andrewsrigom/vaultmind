import { createOpenAIEmbeddingProvider } from '@/lib/providers/openai-embedding-provider';
import { validateEmbeddingVector } from '@/lib/providers/embedding-provider';

import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';

export async function createEmbedding(
  input: string,
  provider: EmbeddingProvider = createOpenAIEmbeddingProvider(),
): Promise<number[]> {
  return validateEmbeddingVector(await provider.createEmbedding(input));
}
