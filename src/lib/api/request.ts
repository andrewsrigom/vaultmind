import { articleRouteParamsSchema } from '@/lib/validators/article';
import {
  getZodErrorMessage,
  workspaceIndexRouteParamsSchema,
  workspaceIndexSourceRouteParamsSchema,
} from '@/lib/validators/workspace-index';
import { apiError } from '@/lib/api/responses';
import { z } from 'zod';
import {
  workspaceIndexAreaDiscoveryRouteParamsSchema,
  workspaceIndexAreaSuggestionRouteParamsSchema,
} from '@/lib/validators/area-discovery';
import { chatSessionRouteParamsSchema } from '@/lib/validators/chat';
import { vaultRouteParamsSchema } from '@/lib/validators/vault';

import type { ArticleRouteParamsInput } from '@/lib/validators/article';
import type { ApiErrorResponse } from '@/lib/api/responses';
import type {
  WorkspaceIndexAreaDiscoveryRouteParams,
  WorkspaceIndexAreaSuggestionRouteParams,
} from '@/lib/validators/area-discovery';
import type { ChatSessionRouteParams } from '@/lib/validators/chat';
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import type { VaultRouteParams } from '@/lib/validators/vault';
import type {
  WorkspaceIndexRouteParams,
  WorkspaceIndexSourceRouteParams,
} from '@/lib/validators/workspace-index';

const defaultJsonRequestBodyMaxBytes = 2 * 1024 * 1024;
const payloadTooLargeMessage = 'Request body exceeds the maximum allowed size.';

type JsonRequestBodySchema<TBody> = {
  safeParse: (value: unknown) =>
    | {
        data: TBody;
        success: true;
      }
    | {
        error: z.ZodError;
        success: false;
      };
};

type ReadRequestBodyOptions = {
  maxBodyBytes?: number;
};

type ParseJsonRequestBodyOptions = ReadRequestBodyOptions & {
  fallbackBody?: unknown;
};

type RouteParamsSchema<TParams extends Record<string, string>> = {
  safeParse: (value: unknown) =>
    | {
        data: TParams;
        success: true;
      }
    | {
        success: false;
      };
};

export type RouteContext<TParams extends Record<string, string>> = {
  params: Promise<TParams>;
};

export type ArticleRouteContext = RouteContext<ArticleRouteParamsInput>;
export type ChatSessionRouteContext = RouteContext<ChatSessionRouteParams>;
export type VaultRouteContext = RouteContext<VaultRouteParams>;
export type WorkspaceIndexAreaDiscoveryRouteContext =
  RouteContext<WorkspaceIndexAreaDiscoveryRouteParams>;
export type WorkspaceIndexAreaSuggestionRouteContext =
  RouteContext<WorkspaceIndexAreaSuggestionRouteParams>;
export type WorkspaceIndexRouteContext = RouteContext<WorkspaceIndexRouteParams>;
export type WorkspaceIndexSourceRouteContext = RouteContext<WorkspaceIndexSourceRouteParams>;

export type OptionalUuidSearchParam =
  | {
      ok: false;
    }
  | {
      ok: true;
      value: string | null;
    };

export type ParsedJsonRequestBody<TBody> =
  | {
      data: TBody;
      ok: true;
    }
  | {
      ok: false;
      response: NextResponse<ApiErrorResponse>;
    };

export type ParsedRequestBody<TBody> = ParsedJsonRequestBody<TBody>;

type LimitedRequestBody =
  | {
      bytes: Uint8Array;
      ok: true;
    }
  | {
      ok: false;
      reason: 'payload-too-large' | 'read-failed';
    };

function exceedsDeclaredContentLength(request: Request, maxBodyBytes: number): boolean {
  const rawContentLength = request.headers.get('content-length')?.trim();

  if (!rawContentLength || !/^\d+$/.test(rawContentLength)) {
    return false;
  }

  const contentLength = Number(rawContentLength);

  return !Number.isSafeInteger(contentLength) || contentLength > maxBodyBytes;
}

function resolveMaxBodyBytes(maxBodyBytes: number | undefined): number {
  const resolvedMaxBodyBytes = maxBodyBytes ?? defaultJsonRequestBodyMaxBytes;

  if (!Number.isSafeInteger(resolvedMaxBodyBytes) || resolvedMaxBodyBytes < 0) {
    throw new RangeError('maxBodyBytes must be a non-negative safe integer.');
  }

  return resolvedMaxBodyBytes;
}

async function readLimitedRequestBody(
  request: Request,
  maxBodyBytes: number,
): Promise<LimitedRequestBody> {
  if (exceedsDeclaredContentLength(request, maxBodyBytes)) {
    return { ok: false, reason: 'payload-too-large' };
  }

  if (!request.body) {
    return { bytes: new Uint8Array(), ok: true };
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;

  try {
    reader = request.body.getReader();
  } catch {
    return { ok: false, reason: 'read-failed' };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      totalBytes += chunk.value.byteLength;

      if (totalBytes > maxBodyBytes) {
        // A cloned request may wait for its other tee branch before cancel resolves.
        void reader.cancel().catch(() => undefined);

        return { ok: false, reason: 'payload-too-large' };
      }

      chunks.push(chunk.value);
    }
  } catch {
    return { ok: false, reason: 'read-failed' };
  } finally {
    reader.releaseLock();
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes: bodyBytes, ok: true };
}

function parseJsonBytes(bodyBytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bodyBytes)) as unknown;
  } catch {
    return null;
  }
}

function payloadTooLargeResponse(): NextResponse<ApiErrorResponse> {
  return apiError('payload-too-large', payloadTooLargeMessage, 413);
}

export async function readJsonRequestBody(
  request: Request,
  options: ReadRequestBodyOptions = {},
): Promise<ParsedRequestBody<unknown>> {
  const maxBodyBytes = resolveMaxBodyBytes(options.maxBodyBytes);
  const limitedBody = await readLimitedRequestBody(request, maxBodyBytes);

  if (!limitedBody.ok && limitedBody.reason === 'payload-too-large') {
    return {
      ok: false,
      response: payloadTooLargeResponse(),
    };
  }

  return {
    data: limitedBody.ok ? parseJsonBytes(limitedBody.bytes) : null,
    ok: true,
  };
}

export async function readTextRequestBody(
  request: Request,
  options: ReadRequestBodyOptions = {},
): Promise<ParsedRequestBody<string>> {
  const maxBodyBytes = resolveMaxBodyBytes(options.maxBodyBytes);
  const limitedBody = await readLimitedRequestBody(request, maxBodyBytes);

  if (!limitedBody.ok) {
    return {
      ok: false,
      response:
        limitedBody.reason === 'payload-too-large'
          ? payloadTooLargeResponse()
          : apiError('invalid-input', 'Request body could not be read.', 400),
    };
  }

  return {
    data: new TextDecoder().decode(limitedBody.bytes),
    ok: true,
  };
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const result = await readJsonRequestBody(request);

  return result.ok ? result.data : null;
}

export async function parseJsonRequestBody<TBody>(
  request: Request,
  schema: JsonRequestBodySchema<TBody>,
  options: ParseJsonRequestBodyOptions = {},
): Promise<ParsedJsonRequestBody<TBody>> {
  const requestBody = await readJsonRequestBody(request, {
    ...(options.maxBodyBytes !== undefined ? { maxBodyBytes: options.maxBodyBytes } : {}),
  });

  if (!requestBody.ok) {
    return requestBody;
  }

  const hasFallbackBody = 'fallbackBody' in options;
  const bodyToParse =
    requestBody.data === null && hasFallbackBody ? options.fallbackBody : requestBody.data;
  const parsedBody = schema.safeParse(bodyToParse);

  if (!parsedBody.success) {
    return {
      ok: false,
      response: apiError('invalid-input', getZodErrorMessage(parsedBody.error), 400),
    };
  }

  return {
    data: parsedBody.data,
    ok: true,
  };
}

export function parseOptionalUuidSearchParam(
  request: NextRequest,
  name: string,
): OptionalUuidSearchParam {
  const value = request.nextUrl.searchParams.get(name);

  if (!value) {
    return {
      ok: true,
      value: null,
    };
  }

  const parsedValue = z.uuid().safeParse(value);

  if (!parsedValue.success) {
    return {
      ok: false,
    };
  }

  return {
    ok: true,
    value: parsedValue.data,
  };
}

export async function parseRouteParams<TParams extends Record<string, string>>(
  context: RouteContext<TParams>,
  schema: RouteParamsSchema<TParams>,
): Promise<TParams | null> {
  const params = await context.params;
  const parsedParams = schema.safeParse(params);

  return parsedParams.success ? parsedParams.data : null;
}

export async function parseArticleParams(
  context: ArticleRouteContext,
): Promise<ArticleRouteParamsInput | null> {
  return parseRouteParams(context, articleRouteParamsSchema);
}

export async function parseChatSessionIdParam(
  context: ChatSessionRouteContext,
): Promise<string | null> {
  const params = await parseRouteParams(context, chatSessionRouteParamsSchema);

  return params?.chatSessionId ?? null;
}

export async function parseVaultIdParam(context: VaultRouteContext): Promise<string | null> {
  const params = await parseRouteParams(context, vaultRouteParamsSchema);

  return params?.vaultId ?? null;
}

export async function parseWorkspaceIndexIdParam(
  context: WorkspaceIndexRouteContext,
): Promise<string | null> {
  const params = await parseRouteParams(context, workspaceIndexRouteParamsSchema);

  return params?.workspaceIndexId ?? null;
}

export async function parseWorkspaceIndexSourceParams(
  context: WorkspaceIndexSourceRouteContext,
): Promise<WorkspaceIndexSourceRouteParams | null> {
  return parseRouteParams(context, workspaceIndexSourceRouteParamsSchema);
}

export async function parseWorkspaceIndexAreaDiscoveryParams(
  context: WorkspaceIndexAreaDiscoveryRouteContext,
): Promise<{ areaDiscoveryRunId: string; workspaceIndexId: string } | null> {
  return parseRouteParams(context, workspaceIndexAreaDiscoveryRouteParamsSchema);
}

export async function parseWorkspaceIndexAreaSuggestionParams(
  context: WorkspaceIndexAreaSuggestionRouteContext,
): Promise<{ areaSuggestionId: string; workspaceIndexId: string } | null> {
  return parseRouteParams(context, workspaceIndexAreaSuggestionRouteParamsSchema);
}
