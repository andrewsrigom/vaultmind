import { NextResponse } from 'next/server';

const apiJsonHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export type ApiErrorCode =
  | 'access-rate-limited'
  | 'area-discovery-already-running'
  | 'area-discovery-invalid-output'
  | 'area-discovery-no-documents'
  | 'area-discovery-run-not-found'
  | 'database-error'
  | 'duplicate-source-document'
  | 'chat-config-error'
  | 'chat-provider-error'
  | 'embedding-config-error'
  | 'embedding-dimension-mismatch'
  | 'embedding-provider-error'
  | 'feature-retired'
  | 'google-drive-fetch-failed'
  | 'google-drive-no-readable-documents'
  | 'google-drive-not-connected'
  | 'google-drive-oauth-not-configured'
  | 'google-drive-rate-limited'
  | 'google-drive-resource-not-found'
  | 'google-drive-unauthorized'
  | 'github-branch-not-found'
  | 'github-fetch-failed'
  | 'github-markdown-file-too-large'
  | 'github-markdown-total-too-large'
  | 'github-no-markdown-files'
  | 'github-oauth-not-configured'
  | 'github-rate-limited'
  | 'github-repo-not-found'
  | 'github-token-missing'
  | 'github-too-many-markdown-files'
  | 'github-unauthorized'
  | 'forbidden'
  | 'invalid-github-url'
  | 'invalid-input'
  | 'ingestion-failed'
  | 'not-found'
  | 'notion-fetch-failed'
  | 'notion-no-readable-pages'
  | 'notion-not-connected'
  | 'notion-oauth-not-configured'
  | 'notion-rate-limited'
  | 'notion-resource-not-found'
  | 'notion-unauthorized'
  | 'payload-too-large'
  | 'source-credential-decryption-failed'
  | 'source-credential-key-missing'
  | 'source-not-configured'
  | 'sync-already-running'
  | 'sync-lease-lost'
  | 'unauthorized'
  | 'unexpected-error'
  | 'unsupported-github-host';

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
  ok: false;
};

export type ApiSuccessResponse<TBody extends Record<string, unknown>> = TBody & {
  ok: true;
};

const localPostgresTroubleshootingMessage = 'Check the local PostgreSQL container and try again.';

function appendLocalPostgresTroubleshooting(message: string): string {
  return `${message} ${localPostgresTroubleshootingMessage}`;
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
      ok: false,
    },
    {
      headers: apiJsonHeaders,
      status,
    },
  );
}

export function apiDatabaseError(message: string): NextResponse<ApiErrorResponse> {
  return apiError('database-error', appendLocalPostgresTroubleshooting(message), 500);
}

export function apiUnexpectedError(message: string): NextResponse<ApiErrorResponse> {
  return apiError('unexpected-error', appendLocalPostgresTroubleshooting(message), 500);
}

export function apiSuccess<TBody extends Record<string, unknown>>(
  body: TBody,
  status = 200,
): NextResponse<ApiSuccessResponse<TBody>> {
  return NextResponse.json(
    {
      ...body,
      ok: true,
    },
    {
      headers: apiJsonHeaders,
      status,
    },
  );
}
