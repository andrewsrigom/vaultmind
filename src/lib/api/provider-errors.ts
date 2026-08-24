import { apiError } from '@/lib/api/responses';

import type { ApiErrorResponse } from '@/lib/api/responses';
import type { ChatProviderError } from '@/lib/providers/chat-provider';
import type { EmbeddingProviderError } from '@/lib/providers/embedding-provider';
import type { NextResponse } from 'next/server';

type EmbeddingProviderApiErrorOptions = {
  configMessage?: string;
  configStatus?: number;
  dimensionMismatchMessage?: string;
  dimensionMismatchStatus?: number;
  providerMessage?: string;
  providerStatus?: number;
};

export function toChatProviderApiError(error: ChatProviderError): NextResponse<ApiErrorResponse> {
  const status = error.code === 'chat-config-error' ? 500 : 502;

  return apiError(error.code, error.message, status);
}

export function toEmbeddingProviderApiError(
  error: EmbeddingProviderError,
  options: EmbeddingProviderApiErrorOptions = {},
): NextResponse<ApiErrorResponse> {
  if (error.code === 'embedding-config-error') {
    return apiError(
      error.code,
      options.configMessage ?? error.message,
      options.configStatus ?? 500,
    );
  }

  if (error.code === 'embedding-dimension-mismatch') {
    return apiError(
      error.code,
      options.dimensionMismatchMessage ?? error.message,
      options.dimensionMismatchStatus ?? 500,
    );
  }

  return apiError(
    error.code,
    options.providerMessage ?? error.message,
    options.providerStatus ?? 502,
  );
}
