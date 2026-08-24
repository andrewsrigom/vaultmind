import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, POST } from '@/app/api/vault/[vaultId]/docs/[docId]/archive/route';

import type { NextRequest } from 'next/server';
import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';

const vaultId = '00000000-0000-4000-8000-000000001011';
const docId = '00000000-0000-4000-8000-000000001012';

const mocks = vi.hoisted(() => ({
  archiveWorkspaceDoc: vi.fn(),
  requireVaultDocsManagementForRequest: vi.fn(),
  restoreWorkspaceDoc: vi.fn(),
}));

vi.mock('@/db/queries/workspace-docs', () => ({
  archiveWorkspaceDoc: mocks.archiveWorkspaceDoc,
  restoreWorkspaceDoc: mocks.restoreWorkspaceDoc,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsManagementForRequest: mocks.requireVaultDocsManagementForRequest,
}));

function createRequest(method: 'DELETE' | 'POST'): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/docs/${docId}/archive`, {
    method,
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
  mocks.archiveWorkspaceDoc.mockResolvedValue({
    archivedAt: new Date('2026-06-26T12:00:00.000Z'),
    id: docId,
    includeInAskAi: false,
    title: 'Internal Launch Checklist',
    vaultId,
  });
  mocks.restoreWorkspaceDoc.mockResolvedValue({
    archivedAt: null,
    id: docId,
    includeInAskAi: false,
    title: 'Internal Launch Checklist',
    vaultId,
  });
});

describe('/api/vault/[vaultId]/docs/[docId]/archive', () => {
  it('archives a workspace doc inside the vault scope', async () => {
    const response = await POST(createRequest('POST'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        includeInAskAi: false,
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.archiveWorkspaceDoc).toHaveBeenCalledWith({
      docId,
      vaultId,
    });
  });

  it('restores an archived workspace doc inside the vault scope', async () => {
    const response = await DELETE(createRequest('DELETE'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        archivedAt: null,
        id: docId,
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.restoreWorkspaceDoc).toHaveBeenCalledWith({
      docId,
      vaultId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await POST(
      createRequest('POST'),
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

  it('returns not found when the doc cannot be archived', async () => {
    mocks.archiveWorkspaceDoc.mockResolvedValue(null);

    const response = await POST(createRequest('POST'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
  });
});
