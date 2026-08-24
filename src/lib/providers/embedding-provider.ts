export const expectedEmbeddingDimensions = 1536;
export const supportedEmbeddingModel = 'text-embedding-3-small';

export type EmbeddingProvider = {
  createEmbedding(input: string): Promise<number[]>;
  dimensions: number;
  model: string;
};

export type EmbeddingProviderErrorCode =
  | 'embedding-config-error'
  | 'embedding-dimension-mismatch'
  | 'embedding-provider-error';

export class EmbeddingProviderError extends Error {
  code: EmbeddingProviderErrorCode;

  constructor(code: EmbeddingProviderErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function validateEmbeddingVector(vector: number[]): number[] {
  if (vector.length !== expectedEmbeddingDimensions) {
    throw new EmbeddingProviderError(
      'embedding-dimension-mismatch',
      `Embedding vector must have ${expectedEmbeddingDimensions} dimensions.`,
    );
  }

  return vector;
}
