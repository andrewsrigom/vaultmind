import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from '@/app/api/vault/[vaultId]/areas/[areaId]/route';

import type { NextRequest } from 'next/server';
import type { RouteContext } from '@/lib/api/request';
import type { WorkspaceAreaRouteParams } from '@/lib/validators/workspace-area';

const vaultId = '00000000-0000-4000-8000-000000001911';
const areaId = '00000000-0000-4000-8000-000000001912';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  requireVaultDocsManagementForRequest: vi.fn(),
  updateWorkspaceArea: vi.fn(),
}));

vi.mock('@/db/queries/workspace-areas', () => ({
  updateWorkspaceArea: mocks.updateWorkspaceArea,
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
  return new Request(`http://localhost:3000/api/vault/${vaultId}/areas/${areaId}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PATCH',
  }) as NextRequest;
}

function createContext(
  overrides: Partial<{
    areaId: string;
    vaultId: string;
  }> = {},
): RouteContext<WorkspaceAreaRouteParams> {
  return {
    params: Promise.resolve({
      areaId,
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
  mocks.updateWorkspaceArea.mockResolvedValue({
    description: 'Payment delivery context',
    icon: 'coins',
    id: areaId,
    name: 'Payments',
    vaultId,
  });
});

describe('/api/vault/[vaultId]/areas/[areaId]', () => {
  it('updates a workspace area inside the vault scope', async () => {
    const response = await PATCH(
      createRequest({
        description: 'Payment delivery context',
        icon: 'coins',
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
    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceArea).toHaveBeenCalledWith({
      description: 'Payment delivery context',
      icon: 'coins',
      name: 'Payments',
      vaultId,
      workspaceAreaId: areaId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await PATCH(
      createRequest({
        description: null,
        icon: 'folder',
        name: 'Payments',
      }),
      createContext({
        areaId: 'not-a-uuid',
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

  it('rejects invalid bodies before updating', async () => {
    const response = await PATCH(
      createRequest({
        description: null,
        icon: 'not-an-icon',
        name: 'Payments',
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
    expect(mocks.updateWorkspaceArea).not.toHaveBeenCalled();
  });

  it('returns not found when the area is outside the vault', async () => {
    mocks.updateWorkspaceArea.mockResolvedValue(null);

    const response = await PATCH(
      createRequest({
        description: null,
        icon: 'folder',
        name: 'Payments',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
  });
});
