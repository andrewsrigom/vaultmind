import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from '@/app/api/vault/[vaultId]/docs/[docId]/favorite/route';

import type { NextRequest } from 'next/server';
import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';

const vaultId = '00000000-0000-4000-8000-000000001021';
const docId = '00000000-0000-4000-8000-000000001022';

const mocks = vi.hoisted(() => ({
  requireVaultDocsManagementForRequest: vi.fn(),
  setWorkspaceDocFavorite: vi.fn(),
}));

vi.mock('@/db/queries/workspace-docs', () => ({
  setWorkspaceDocFavorite: mocks.setWorkspaceDocFavorite,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsManagementForRequest: mocks.requireVaultDocsManagementForRequest,
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/docs/${docId}/favorite`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'PATCH',
  }) as NextRequest;
}

function createContext(
  overrides: Partial<{
    docId: string;
    vaultId: string;
  }> = {},
): RouteContext<VaultWorkspaceDocDetailRouteParams> {
  return {
    params: Promise.resolve({
      docId,
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
  });
  mocks.setWorkspaceDocFavorite.mockResolvedValue({
    id: docId,
    isFavorite: true,
    title: 'Internal Launch Checklist',
    vaultId,
  });
});

describe('/api/vault/[vaultId]/docs/[docId]/favorite', () => {
  it('updates a workspace doc favorite flag inside the vault scope', async () => {
    const response = await PATCH(createRequest({ isFavorite: true }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        isFavorite: true,
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.setWorkspaceDocFavorite).toHaveBeenCalledWith({
      docId,
      isFavorite: true,
      vaultId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await PATCH(
      createRequest({ isFavorite: true }),
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

  it('rejects invalid request bodies before updating the doc', async () => {
    const response = await PATCH(createRequest({ isFavorite: 'yes' }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.setWorkspaceDocFavorite).not.toHaveBeenCalled();
  });

  it('returns not found when the doc is missing', async () => {
    mocks.setWorkspaceDocFavorite.mockResolvedValue(null);

    const response = await PATCH(createRequest({ isFavorite: false }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
  });
});
