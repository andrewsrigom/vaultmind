import { describe, expect, it } from 'vitest';

import { POST } from '@/app/api/locale/route';
import { localeCookieName } from '@/lib/i18n';

import type { NextRequest } from 'next/server';

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost:3000/api/locale', {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  }) as NextRequest;
}

describe('/api/locale', () => {
  it('sets the locale cookie for a valid locale', async () => {
    const response = await POST(
      createRequest({
        locale: 'pt-BR',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      locale: 'pt-BR',
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(response.cookies.get(localeCookieName)?.value).toBe('pt-BR');
  });

  it('rejects unsupported locales', async () => {
    const response = await POST(
      createRequest({
        locale: 'es',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(response.cookies.get(localeCookieName)).toBeUndefined();
  });
});
