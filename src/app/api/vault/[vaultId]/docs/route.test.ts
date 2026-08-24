import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/vault/[vaultId]/docs/route';

import type { NextRequest } from 'next/server';
import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocRouteParams } from '@/lib/validators/workspace-doc';

const vaultId = '00000000-0000-4000-8000-000000001001';
const workspaceAreaId = '00000000-0000-4000-8000-000000001002';
const parentDocId = '00000000-0000-4000-8000-000000001003';
const docId = '00000000-0000-4000-8000-000000001004';

const mocks = vi.hoisted(() => ({
  createWorkspaceDoc: vi.fn(),
  requireVaultDocsCreationForRequest: vi.fn(),
}));

vi.mock('@/db/queries/workspace-docs', () => ({
  createWorkspaceDoc: mocks.createWorkspaceDoc,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsCreationForRequest: mocks.requireVaultDocsCreationForRequest,
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/docs`, {
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
): RouteContext<VaultWorkspaceDocRouteParams> {
  return {
    params: Promise.resolve({
      vaultId,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVaultDocsCreationForRequest.mockResolvedValue({
    context: {
      permissions: ['docs.create'],
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
  mocks.createWorkspaceDoc.mockResolvedValue({
    content: '# Internal Launch Checklist',
    docType: 'note',
    id: docId,
    parentDocId,
    status: 'draft',
    tags: ['launch', 'internal'],
    title: 'Internal Launch Checklist',
    vaultId,
    workspaceAreaId,
  });
});

describe('/api/vault/[vaultId]/docs', () => {
  it('creates a workspace doc inside the vault scope', async () => {
    const response = await POST(
      createRequest({
        content: '# Internal Launch Checklist',
        docType: 'note',
        metadata: {
          owner: 'delivery',
        },
        parentDocId,
        status: 'draft',
        tags: ['launch', 'internal'],
        title: 'Internal Launch Checklist',
        workspaceAreaId,
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      doc: {
        id: docId,
        title: 'Internal Launch Checklist',
      },
      ok: true,
    });
    expect(response.status).toBe(201);
    expect(mocks.requireVaultDocsCreationForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      vaultId,
    });
    expect(mocks.createWorkspaceDoc).toHaveBeenCalledWith({
      content: '# Internal Launch Checklist',
      docType: 'note',
      metadata: {
        owner: 'delivery',
      },
      parentDocId,
      status: 'draft',
      tags: ['launch', 'internal'],
      title: 'Internal Launch Checklist',
      vaultId,
      workspaceAreaId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await POST(
      createRequest({
        title: 'Internal Launch Checklist',
        workspaceAreaId,
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
    expect(mocks.requireVaultDocsCreationForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid request bodies before creating a doc', async () => {
    const response = await POST(
      createRequest({
        title: '',
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
    expect(mocks.createWorkspaceDoc).not.toHaveBeenCalled();
  });

  it('returns not found when the target space or parent is missing', async () => {
    mocks.createWorkspaceDoc.mockResolvedValue(null);

    const response = await POST(
      createRequest({
        title: 'Internal Launch Checklist',
        workspaceAreaId,
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
