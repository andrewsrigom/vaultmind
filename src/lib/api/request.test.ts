import { describe, expect, it } from 'vitest';

import {
  parseJsonRequestBody,
  parseArticleParams,
  parseChatSessionIdParam,
  parseVaultIdParam,
  parseOptionalUuidSearchParam,
  parseWorkspaceIndexIdParam,
  readJsonBody,
  readTextRequestBody,
} from '@/lib/api/request';
import { z } from 'zod';

import type { NextRequest } from 'next/server';

function createJsonRequest(body: string, headers: HeadersInit = {}): NextRequest {
  return new Request('http://localhost/api/test', {
    body,
    headers,
    method: 'POST',
  }) as NextRequest;
}

function createStreamingRequest(chunks: string[], headers: HeadersInit = {}): NextRequest {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });

  return new Request('http://localhost/api/test', {
    body,
    duplex: 'half',
    headers,
    method: 'POST',
  } as RequestInit & { duplex: 'half' }) as NextRequest;
}

function createSearchParamRequest(search: string): NextRequest {
  return {
    nextUrl: new URL(`http://localhost/api/test${search}`),
  } as NextRequest;
}

describe('readJsonBody', () => {
  it('returns parsed JSON request bodies', async () => {
    await expect(readJsonBody(createJsonRequest('{"name":"VaultMind"}'))).resolves.toEqual({
      name: 'VaultMind',
    });
  });

  it('returns null for invalid JSON bodies', async () => {
    await expect(readJsonBody(createJsonRequest('{invalid'))).resolves.toBeNull();
  });

  it('keeps the legacy null result for oversized bodies without reading them', async () => {
    const request = createJsonRequest('{"name":"VaultMind"}', {
      'content-length': String(2 * 1024 * 1024 + 1),
    });

    await expect(readJsonBody(request)).resolves.toBeNull();
    expect(request.bodyUsed).toBe(false);
  });
});

describe('readTextRequestBody', () => {
  it('preserves the raw request text exactly', async () => {
    const rawBody = ' {\n  "id": "evt_test"\n}\n';

    await expect(
      readTextRequestBody(createStreamingRequest([' {\n', '  "id": "evt_test"\n', '}\n']), {
        maxBodyBytes: new TextEncoder().encode(rawBody).byteLength,
      }),
    ).resolves.toEqual({
      data: rawBody,
      ok: true,
    });
  });

  it('rejects a declared content length above the limit without reading the body', async () => {
    const request = createJsonRequest('raw', {
      'content-length': '9',
    });
    const result = await readTextRequestBody(request, {
      maxBodyBytes: 8,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Expected an oversized text request body.');
    }

    await expect(result.response.json()).resolves.toMatchObject({
      error: {
        code: 'payload-too-large',
      },
      ok: false,
    });
    expect(result.response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it('rejects chunked streams whose actual bytes exceed the limit', async () => {
    const result = await readTextRequestBody(createStreamingRequest(['1234', '56789']), {
      maxBodyBytes: 8,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Expected an oversized text request body.');
    }

    await expect(result.response.json()).resolves.toMatchObject({
      error: {
        code: 'payload-too-large',
      },
      ok: false,
    });
    expect(result.response.status).toBe(413);
  });
});

describe('parseJsonRequestBody', () => {
  const testBodySchema = z.object({
    name: z.string().trim().min(1),
  });

  it('returns typed parsed JSON request bodies', async () => {
    await expect(
      parseJsonRequestBody(createJsonRequest('{"name":"VaultMind"}'), testBodySchema),
    ).resolves.toEqual({
      data: {
        name: 'VaultMind',
      },
      ok: true,
    });
  });

  it('returns a stable invalid-input response for invalid bodies', async () => {
    const result = await parseJsonRequestBody(createJsonRequest('{"name":""}'), testBodySchema);

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Expected invalid request body.');
    }

    await expect(result.response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(result.response.status).toBe(400);
  });

  it('supports explicit fallback bodies for endpoints that allow empty JSON', async () => {
    const optionalBodySchema = z
      .object({
        stream: z.boolean().optional(),
      })
      .strict();

    await expect(
      parseJsonRequestBody(createJsonRequest('{invalid'), optionalBodySchema, {
        fallbackBody: {},
      }),
    ).resolves.toEqual({
      data: {},
      ok: true,
    });
  });

  it('accepts JSON bodies up to 2 MiB by default', async () => {
    const maxBodyBytes = 2 * 1024 * 1024;
    const jsonFramingBytes = new TextEncoder().encode('{"name":""}').byteLength;
    const name = 'a'.repeat(maxBodyBytes - jsonFramingBytes);
    const result = await parseJsonRequestBody(
      createJsonRequest(JSON.stringify({ name })),
      testBodySchema,
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected request body at the size limit to be accepted.');
    }

    expect(result.data.name).toHaveLength(name.length);
  });

  it('rejects a declared content length above the default limit without reading the body', async () => {
    const request = createJsonRequest('{"name":"VaultMind"}', {
      'content-length': String(2 * 1024 * 1024 + 1),
    });
    const result = await parseJsonRequestBody(request, testBodySchema);

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Expected an oversized request body.');
    }

    await expect(result.response.json()).resolves.toEqual({
      error: {
        code: 'payload-too-large',
        message: 'Request body exceeds the maximum allowed size.',
      },
      ok: false,
    });
    expect(result.response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
  });

  it('counts streamed UTF-8 bytes instead of JavaScript characters', async () => {
    const body = '{"name":"é"}';
    const maxBodyBytes = body.length;

    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(maxBodyBytes);

    const result = await parseJsonRequestBody(
      createJsonRequest(body, {
        'content-length': String(maxBodyBytes),
      }),
      testBodySchema,
      { maxBodyBytes },
    );

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Expected an oversized request body.');
    }

    await expect(result.response.json()).resolves.toMatchObject({
      error: {
        code: 'payload-too-large',
      },
      ok: false,
    });
    expect(result.response.status).toBe(413);
  });

  it('does not let fallback bodies bypass the streamed byte limit', async () => {
    const result = await parseJsonRequestBody(
      createStreamingRequest(['{invalid', ' payload']),
      testBodySchema,
      {
        fallbackBody: {
          name: 'Fallback',
        },
        maxBodyBytes: 8,
      },
    );

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Expected an oversized request body.');
    }

    await expect(result.response.json()).resolves.toMatchObject({
      error: {
        code: 'payload-too-large',
      },
      ok: false,
    });
    expect(result.response.status).toBe(413);
  });
});

describe('parseWorkspaceIndexIdParam', () => {
  it('returns the UUID workspace index route param', async () => {
    const workspaceIndexId = crypto.randomUUID();

    await expect(
      parseWorkspaceIndexIdParam({
        params: Promise.resolve({ workspaceIndexId }),
      }),
    ).resolves.toBe(workspaceIndexId);
  });

  it('returns null for invalid route params', async () => {
    await expect(
      parseWorkspaceIndexIdParam({
        params: Promise.resolve({ workspaceIndexId: 'not-a-uuid' }),
      }),
    ).resolves.toBeNull();
  });
});

describe('parseOptionalUuidSearchParam', () => {
  it('parses optional UUID search params', () => {
    const sourceId = crypto.randomUUID();

    expect(parseOptionalUuidSearchParam(createSearchParamRequest(''), 'sourceId')).toEqual({
      ok: true,
      value: null,
    });
    expect(
      parseOptionalUuidSearchParam(createSearchParamRequest(`?sourceId=${sourceId}`), 'sourceId'),
    ).toEqual({
      ok: true,
      value: sourceId,
    });
    expect(
      parseOptionalUuidSearchParam(createSearchParamRequest('?sourceId=not-a-uuid'), 'sourceId'),
    ).toEqual({
      ok: false,
    });
  });
});

describe('centralized route param parsers', () => {
  it('parses single-id route params', async () => {
    const chatSessionId = crypto.randomUUID();
    const vaultId = crypto.randomUUID();

    await expect(
      parseChatSessionIdParam({
        params: Promise.resolve({ chatSessionId }),
      }),
    ).resolves.toBe(chatSessionId);
    await expect(
      parseVaultIdParam({
        params: Promise.resolve({ vaultId }),
      }),
    ).resolves.toBe(vaultId);
  });

  it('parses scoped workspace route params', async () => {
    const articleId = crypto.randomUUID();
    const workspaceIndexId = crypto.randomUUID();

    await expect(
      parseArticleParams({
        params: Promise.resolve({ articleId, workspaceIndexId }),
      }),
    ).resolves.toEqual({ articleId, workspaceIndexId });
  });
});
