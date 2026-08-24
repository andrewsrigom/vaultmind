import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/workspace-indexes/[workspaceIndexId]/documents/route';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000002101';
const vaultId = '00000000-0000-4000-8000-000000002102';
const documentId = '00000000-0000-4000-8000-000000002103';

const mocks = vi.hoisted(() => ({
  getWorkspaceIndexDetail: vi.fn(),
  listWorkspaceIndexDocuments: vi.fn(),
  loggerError: vi.fn(),
  requireWorkspaceIndexDocsReadForRequest: vi.fn(),
}));

vi.mock('@/db/queries/documents', () => ({
  listWorkspaceIndexDocuments: mocks.listWorkspaceIndexDocuments,
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  getWorkspaceIndexDetail: mocks.getWorkspaceIndexDetail,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireWorkspaceIndexDocsReadForRequest: mocks.requireWorkspaceIndexDocsReadForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(): NextRequest {
  return new Request(`http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/documents`, {
    method: 'GET',
  }) as NextRequest;
}

function createContext(
  overrides: Partial<{
    workspaceIndexId: string;
  }> = {},
): WorkspaceIndexRouteContext {
  return {
    params: Promise.resolve({
      workspaceIndexId,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkspaceIndexDocsReadForRequest.mockResolvedValue({
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
    workspaceIndex: {
      id: workspaceIndexId,
      vaultId,
    },
  });
  mocks.getWorkspaceIndexDetail.mockResolvedValue({
    workspaceIndex: {
      id: workspaceIndexId,
      name: 'Engineering docs',
      vaultId,
    },
  });
  mocks.listWorkspaceIndexDocuments.mockResolvedValue([
    {
      id: documentId,
      path: 'docs/readiness.md',
      title: 'Readiness checklist',
      workspaceIndexId,
    },
  ]);
});

describe('/api/workspace-indexes/[workspaceIndexId]/documents', () => {
  it('lists indexed documents inside the workspace scope', async () => {
    const response = await GET(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      documents: [
        {
          id: documentId,
          path: 'docs/readiness.md',
          title: 'Readiness checklist',
        },
      ],
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.requireWorkspaceIndexDocsReadForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      workspaceIndexId,
    });
    expect(mocks.listWorkspaceIndexDocuments).toHaveBeenCalledWith({
      workspaceIndexId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await GET(
      createRequest(),
      createContext({
        workspaceIndexId: 'not-a-uuid',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireWorkspaceIndexDocsReadForRequest).not.toHaveBeenCalled();
  });

  it('returns not found when the workspace index is missing', async () => {
    mocks.getWorkspaceIndexDetail.mockResolvedValue(null);

    const response = await GET(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
    expect(mocks.listWorkspaceIndexDocuments).not.toHaveBeenCalled();
  });

  it('maps document query failures to a safe database response', async () => {
    mocks.listWorkspaceIndexDocuments.mockRejectedValue(new Error('database detail'));

    const response = await GET(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'database-error',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to load workspace index documents.',
      expect.any(Error),
      {
        workspaceIndexId,
      },
    );
  });
});
