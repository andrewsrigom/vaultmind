import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from '@/app/api/vault/[vaultId]/docs/[docId]/ask-ai/route';
import { WorkspaceDocAskAiIndexingError } from '@/lib/rag/index-workspace-doc';

import type { NextRequest } from 'next/server';
import type * as IndexWorkspaceDocModule from '@/lib/rag/index-workspace-doc';
import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';

const vaultId = '00000000-0000-4000-8000-000000000971';
const docId = '00000000-0000-4000-8000-000000000972';

const mocks = vi.hoisted(() => ({
  requireVaultDocsManagementForRequest: vi.fn(),
  setWorkspaceDocAskAiIncluded: vi.fn(),
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsManagementForRequest: mocks.requireVaultDocsManagementForRequest,
}));

vi.mock('@/lib/rag/index-workspace-doc', async () => {
  const actual = await vi.importActual<typeof IndexWorkspaceDocModule>(
    '@/lib/rag/index-workspace-doc',
  );

  return {
    setWorkspaceDocAskAiIncluded: mocks.setWorkspaceDocAskAiIncluded,
    WorkspaceDocAskAiIndexingError: actual.WorkspaceDocAskAiIndexingError,
  };
});

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/docs/${docId}/ask-ai`, {
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
  mocks.setWorkspaceDocAskAiIncluded.mockResolvedValue({
    deletedDocuments: 0,
    doc: {
      id: docId,
      includeInAskAi: true,
      title: 'Internal Launch Checklist',
      vaultId,
    },
    documentId: '00000000-0000-4000-8000-000000000973',
    sourceId: '00000000-0000-4000-8000-000000000974',
    summary: {
      documentsCreated: 1,
      documentsDeleted: 0,
      documentsFound: 1,
      skippedUnchanged: 0,
    },
    workspaceIndexId: '00000000-0000-4000-8000-000000000975',
  });
});

describe('/api/vault/[vaultId]/docs/[docId]/ask-ai', () => {
  it('toggles workspace doc Ask AI indexing inside the vault scope', async () => {
    const response = await PATCH(createRequest({ includeInAskAi: true }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        includeInAskAi: true,
      },
      documentId: '00000000-0000-4000-8000-000000000973',
      ok: true,
      sourceId: '00000000-0000-4000-8000-000000000974',
    });
    expect(response.status).toBe(200);
    expect(mocks.requireVaultDocsManagementForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      vaultId,
    });
    expect(mocks.setWorkspaceDocAskAiIncluded).toHaveBeenCalledWith({
      docId,
      includeInAskAi: true,
      vaultId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await PATCH(
      createRequest({ includeInAskAi: true }),
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
    expect(mocks.setWorkspaceDocAskAiIncluded).not.toHaveBeenCalled();
  });

  it('returns not found when the doc is missing', async () => {
    mocks.setWorkspaceDocAskAiIncluded.mockResolvedValue(null);

    const response = await PATCH(createRequest({ includeInAskAi: false }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
  });

  it('maps missing workspace index configuration to a conflict response', async () => {
    mocks.setWorkspaceDocAskAiIncluded.mockRejectedValue(
      new WorkspaceDocAskAiIndexingError(
        'source-not-configured',
        'Create a knowledge base before including internal docs in Ask AI.',
      ),
    );

    const response = await PATCH(createRequest({ includeInAskAi: true }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'source-not-configured',
        message: 'Create a knowledge base before including internal docs in Ask AI.',
      },
      ok: false,
    });
    expect(response.status).toBe(409);
  });
});
