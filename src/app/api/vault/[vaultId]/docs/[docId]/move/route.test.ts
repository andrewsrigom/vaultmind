import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from '@/app/api/vault/[vaultId]/docs/[docId]/move/route';

import type { NextRequest } from 'next/server';
import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';

const vaultId = '00000000-0000-4000-8000-000000001031';
const workspaceAreaId = '00000000-0000-4000-8000-000000001032';
const parentDocId = '00000000-0000-4000-8000-000000001033';
const docId = '00000000-0000-4000-8000-000000001034';

const mocks = vi.hoisted(() => ({
  moveWorkspaceDoc: vi.fn(),
  requireVaultDocsManagementForRequest: vi.fn(),
}));

vi.mock('@/db/queries/workspace-docs', () => ({
  moveWorkspaceDoc: mocks.moveWorkspaceDoc,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsManagementForRequest: mocks.requireVaultDocsManagementForRequest,
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/docs/${docId}/move`, {
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
  mocks.moveWorkspaceDoc.mockResolvedValue({
    id: docId,
    parentDocId,
    title: 'Internal Launch Checklist',
    vaultId,
    workspaceAreaId,
  });
});

describe('/api/vault/[vaultId]/docs/[docId]/move', () => {
  it('moves a workspace doc inside the vault scope', async () => {
    const response = await PATCH(
      createRequest({
        parentDocId,
        workspaceAreaId,
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        parentDocId,
        workspaceAreaId,
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.moveWorkspaceDoc).toHaveBeenCalledWith({
      docId,
      parentDocId,
      vaultId,
      workspaceAreaId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await PATCH(
      createRequest({
        parentDocId,
        workspaceAreaId,
      }),
      createContext({
        docId: 'not-a-uuid',
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

  it('rejects invalid request bodies before moving the doc', async () => {
    const response = await PATCH(
      createRequest({
        parentDocId: 'not-a-uuid',
        workspaceAreaId,
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
    expect(mocks.moveWorkspaceDoc).not.toHaveBeenCalled();
  });

  it('returns invalid input when the move target is not valid', async () => {
    mocks.moveWorkspaceDoc.mockResolvedValue(null);

    const response = await PATCH(
      createRequest({
        parentDocId: null,
        workspaceAreaId,
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
  });
});
