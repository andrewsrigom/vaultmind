import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH } from '@/app/api/vault/[vaultId]/docs/[docId]/route';

import type { NextRequest } from 'next/server';
import type * as IndexWorkspaceDocModule from '@/lib/rag/index-workspace-doc';
import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';

const vaultId = '00000000-0000-4000-8000-000000000991';
const docId = '00000000-0000-4000-8000-000000000992';

const mocks = vi.hoisted(() => ({
  getWorkspaceDoc: vi.fn(),
  indexWorkspaceDocForAskAi: vi.fn(),
  requireVaultDocsManagementForRequest: vi.fn(),
  requireVaultDocsReadForRequest: vi.fn(),
  updateWorkspaceDoc: vi.fn(),
}));

vi.mock('@/db/queries/workspace-docs', () => ({
  getWorkspaceDoc: mocks.getWorkspaceDoc,
  updateWorkspaceDoc: mocks.updateWorkspaceDoc,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsManagementForRequest: mocks.requireVaultDocsManagementForRequest,
  requireVaultDocsReadForRequest: mocks.requireVaultDocsReadForRequest,
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

function createGetRequest(): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/docs/${docId}`, {
    method: 'GET',
  }) as NextRequest;
}

function createPatchRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/docs/${docId}`, {
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
  mocks.requireVaultDocsReadForRequest.mockResolvedValue({
    context: {
      permissions: ['docs.read'],
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
  mocks.getWorkspaceDoc.mockResolvedValue({
    content: '# Internal Launch Checklist',
    id: docId,
    includeInAskAi: true,
    title: 'Internal Launch Checklist',
    vaultId,
  });
  mocks.updateWorkspaceDoc.mockResolvedValue({
    content: '# Updated Internal Launch Checklist',
    id: docId,
    includeInAskAi: true,
    title: 'Updated Internal Launch Checklist',
    vaultId,
  });
  mocks.indexWorkspaceDocForAskAi.mockResolvedValue({
    documentId: '00000000-0000-4000-8000-000000000993',
    sourceId: '00000000-0000-4000-8000-000000000994',
    summary: {
      documentsCreated: 0,
      documentsFound: 1,
      documentsUpdated: 1,
    },
    workspaceIndexId: '00000000-0000-4000-8000-000000000995',
  });
});

describe('/api/vault/[vaultId]/docs/[docId]', () => {
  it('reads a workspace doc inside the vault scope', async () => {
    const response = await GET(createGetRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        title: 'Internal Launch Checklist',
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.getWorkspaceDoc).toHaveBeenCalledWith({
      docId,
      includeArchived: true,
      vaultId,
    });
  });

  it('updates a workspace doc and refreshes Ask AI indexing when included', async () => {
    const response = await PATCH(
      createPatchRequest({
        content: '# Updated Internal Launch Checklist',
        title: 'Updated Internal Launch Checklist',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        includeInAskAi: true,
        title: 'Updated Internal Launch Checklist',
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceDoc).toHaveBeenCalledWith({
      content: '# Updated Internal Launch Checklist',
      docId,
      title: 'Updated Internal Launch Checklist',
      vaultId,
    });
    expect(mocks.indexWorkspaceDocForAskAi).toHaveBeenCalledWith({
      docId,
      vaultId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await GET(
      createGetRequest(),
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
    expect(mocks.requireVaultDocsReadForRequest).not.toHaveBeenCalled();
  });

  it('returns not found when updating a missing doc', async () => {
    mocks.updateWorkspaceDoc.mockResolvedValue(null);

    const response = await PATCH(
      createPatchRequest({
        content: '# Missing',
        title: 'Missing',
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
