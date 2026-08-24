import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/dashboard/route';

import type { NextRequest } from 'next/server';

const vaultId = '00000000-0000-4000-8000-000000004001';

const mocks = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(),
  loggerError: vi.fn(),
  requireVaultAccessForRequest: vi.fn(),
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  getDashboardSummary: mocks.getDashboardSummary,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultAccessForRequest: mocks.requireVaultAccessForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(params: Record<string, string | undefined> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/dashboard');

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const request = new Request(url, {
    method: 'GET',
  }) as NextRequest;

  Object.defineProperty(request, 'nextUrl', {
    value: url,
  });

  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVaultAccessForRequest.mockResolvedValue({
    context: {
      permissions: ['workspace.read'],
      roles: [],
      userId: 'user_123',
      vaultId,
    },
    ok: true,
    session: {
      user: {
        id: 'user_123',
      },
    },
    vaultId,
  });
  mocks.getDashboardSummary.mockResolvedValue({
    sourceCount: 3,
    workspaceIndexCount: 2,
  });
});

describe('/api/dashboard', () => {
  it('loads dashboard summary inside vault workspace read scope', async () => {
    const response = await GET(
      createRequest({
        vaultId,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      summary: {
        sourceCount: 3,
        workspaceIndexCount: 2,
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.requireVaultAccessForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      vaultId,
    });
    expect(mocks.getDashboardSummary).toHaveBeenCalledWith({ vaultId });
  });

  it('requires an vault id before auth', async () => {
    const response = await GET(createRequest());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
        message: 'Vault ID is required.',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireVaultAccessForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid vault ids before auth', async () => {
    const response = await GET(
      createRequest({
        vaultId: 'not-a-uuid',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireVaultAccessForRequest).not.toHaveBeenCalled();
  });

  it('maps dashboard query failures to a safe database response', async () => {
    mocks.getDashboardSummary.mockRejectedValue(new Error('database detail'));

    const response = await GET(
      createRequest({
        vaultId,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'database-error',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to load dashboard summary.',
      expect.any(Error),
    );
  });
});
