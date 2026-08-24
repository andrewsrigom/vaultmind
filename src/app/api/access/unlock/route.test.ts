import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, POST } from '@/app/api/access/unlock/route';

const mocks = vi.hoisted(() => ({
  createLocalAccessSessionToken: vi.fn(),
  getLocalAccessConfiguration: vi.fn(),
  verifyLocalAccessPassword: vi.fn(),
}));

vi.mock('@/lib/access/local-access', () => ({
  createLocalAccessSessionToken: mocks.createLocalAccessSessionToken,
  getLocalAccessConfiguration: mocks.getLocalAccessConfiguration,
  localAccessCookie: {
    httpOnly: true,
    maxAge: 43_200,
    name: 'vaultmind_access',
    path: '/',
    sameSite: 'lax',
    secure: false,
  },
  verifyLocalAccessPassword: mocks.verifyLocalAccessPassword,
}));

function createRequest(method: 'DELETE' | 'POST', password = 'secret'): NextRequest {
  return new NextRequest('http://localhost:3000/api/access/unlock', {
    ...(method === 'POST'
      ? {
          body: JSON.stringify({ password }),
          headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        }
      : { headers: { origin: 'http://localhost:3000' } }),
    method,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createLocalAccessSessionToken.mockReturnValue('signed-session');
  mocks.getLocalAccessConfiguration.mockReturnValue({
    enabled: true,
    passwordHash: 'scrypt-v1$fixture',
  });
  mocks.verifyLocalAccessPassword.mockResolvedValue(true);
});

describe('/api/access/unlock', () => {
  it('unlocks the vault and sets a protected session cookie', async () => {
    const response = await POST(createRequest('POST'));

    await expect(response.json()).resolves.toMatchObject({ ok: true, unlocked: true });
    expect(response.headers.get('set-cookie')).toContain('vaultmind_access=signed-session');
  });

  it('rejects an incorrect password', async () => {
    mocks.verifyLocalAccessPassword.mockResolvedValue(false);

    const response = await POST(createRequest('POST', 'incorrect'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it('locks the vault by expiring the session cookie', async () => {
    const response = await DELETE(createRequest('DELETE'));

    await expect(response.json()).resolves.toMatchObject({ locked: true, ok: true });
    expect(response.headers.get('set-cookie')).toContain('vaultmind_access=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
