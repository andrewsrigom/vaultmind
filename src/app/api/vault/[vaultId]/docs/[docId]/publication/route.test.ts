import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, POST } from '@/app/api/vault/[vaultId]/docs/[docId]/publication/route';

import type { NextRequest } from 'next/server';
import type * as IndexWorkspaceDocModule from '@/lib/rag/index-workspace-doc';
import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';

const vaultId = '00000000-0000-4000-8000-000000000981';
const docId = '00000000-0000-4000-8000-000000000982';

const mocks = vi.hoisted(() => ({
  indexWorkspaceDocForAskAi: vi.fn(),
  publishWorkspaceDoc: vi.fn(),
  requireVaultDocsManagementForRequest: vi.fn(),
  unpublishWorkspaceDoc: vi.fn(),
}));

vi.mock('@/db/queries/workspace-docs', () => ({
  publishWorkspaceDoc: mocks.publishWorkspaceDoc,
  unpublishWorkspaceDoc: mocks.unpublishWorkspaceDoc,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsManagementForRequest: mocks.requireVaultDocsManagementForRequest,
}));

vi.mock('@/lib/rag/index-workspace-doc', async () => {
  const actual = await vi.importActual<typeof IndexWorkspaceDocModule>(
    '@/lib/rag/index-workspace-doc',
  );

  return {
    indexWorkspaceDocForAskAi: mocks.indexWorkspaceDocForAskAi,
    WorkspaceDocAskAiIndexingError: actual.WorkspaceDocAskAiIndexingError,
  };
});

function createRequest(method: 'DELETE' | 'POST'): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/docs/${docId}/publication`, {
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
  mocks.publishWorkspaceDoc.mockResolvedValue({
    id: docId,
    includeInAskAi: true,
    publishedAt: new Date('2026-06-26T12:00:00.000Z'),
    status: 'published',
    title: 'Internal Launch Checklist',
    vaultId,
  });
  mocks.unpublishWorkspaceDoc.mockResolvedValue({
    id: docId,
    includeInAskAi: false,
    publishedAt: null,
    status: 'draft',
    title: 'Internal Launch Checklist',
    vaultId,
  });
  mocks.indexWorkspaceDocForAskAi.mockResolvedValue({
    documentId: '00000000-0000-4000-8000-000000000983',
    sourceId: '00000000-0000-4000-8000-000000000984',
    summary: {
      documentsCreated: 1,
      documentsDeleted: 0,
      documentsFound: 1,
      skippedUnchanged: 0,
    },
    workspaceIndexId: '00000000-0000-4000-8000-000000000985',
  });
});

describe('/api/vault/[vaultId]/docs/[docId]/publication', () => {
  it('publishes a doc and refreshes Ask AI indexing when the doc is included', async () => {
    const response = await POST(createRequest('POST'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        includeInAskAi: true,
        status: 'published',
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.publishWorkspaceDoc).toHaveBeenCalledWith({
      docId,
      vaultId,
    });
    expect(mocks.indexWorkspaceDocForAskAi).toHaveBeenCalledWith({
      docId,
      vaultId,
    });
  });

  it('unpublishes a doc without indexing when Ask AI inclusion is disabled', async () => {
    const response = await DELETE(createRequest('DELETE'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        includeInAskAi: false,
        status: 'draft',
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.unpublishWorkspaceDoc).toHaveBeenCalledWith({
      docId,
      vaultId,
    });
    expect(mocks.indexWorkspaceDocForAskAi).not.toHaveBeenCalled();
  });

  it('rejects invalid route params before auth', async () => {
    const response = await POST(
      createRequest('POST'),
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

  it('returns not found when the doc is missing', async () => {
    mocks.publishWorkspaceDoc.mockResolvedValue(null);

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
