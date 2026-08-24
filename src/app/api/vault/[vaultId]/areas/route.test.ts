import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/vault/[vaultId]/areas/route';

import type { NextRequest } from 'next/server';
import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceAreaRouteParams } from '@/lib/validators/workspace-area';

const vaultId = '00000000-0000-4000-8000-000000001901';
const areaId = '00000000-0000-4000-8000-000000001902';

const mocks = vi.hoisted(() => ({
  createWorkspaceArea: vi.fn(),
  loggerError: vi.fn(),
  requireVaultDocsManagementForRequest: vi.fn(),
}));

vi.mock('@/db/queries/workspace-areas', () => ({
  createWorkspaceArea: mocks.createWorkspaceArea,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsManagementForRequest: mocks.requireVaultDocsManagementForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/areas`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  }) as NextRequest;
}

function createContext(
  overrides: Partial<{
    vaultId: string;
  }> = {},
): RouteContext<VaultWorkspaceAreaRouteParams> {
  return {
    params: Promise.resolve({
      vaultId,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVaultDocsManagementForRequest.mockResolvedValue({
    context: {
      permissions: ['docs.manage'],
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
  mocks.createWorkspaceArea.mockResolvedValue({
    id: areaId,
    name: 'Payments',
    vaultId,
  });
});

describe('/api/vault/[vaultId]/areas', () => {
  it('creates a workspace area inside the vault scope', async () => {
    const response = await POST(
      createRequest({
        name: 'Payments',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      area: {
        id: areaId,
        name: 'Payments',
      },
      ok: true,
    });
    expect(response.status).toBe(201);
    expect(mocks.requireVaultDocsManagementForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      vaultId,
    });
    expect(mocks.createWorkspaceArea).toHaveBeenCalledWith({
      name: 'Payments',
      vaultId,
    });
  });

  it('rejects invalid vault params before auth', async () => {
    const response = await POST(
      createRequest({
        name: 'Payments',
      }),
      createContext({
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
    expect(mocks.requireVaultDocsManagementForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid bodies before creating an area', async () => {
    const response = await POST(
      createRequest({
        name: '',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.createWorkspaceArea).not.toHaveBeenCalled();
  });

  it('maps unexpected create errors to a safe response', async () => {
    mocks.createWorkspaceArea.mockRejectedValue(new Error('database detail'));

    const response = await POST(
      createRequest({
        name: 'Payments',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'unexpected-error',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to create workspace area.',
      expect.any(Error),
      {
        vaultId,
      },
    );
  });
});
