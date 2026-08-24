import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH } from '@/app/api/workspace-indexes/[workspaceIndexId]/route';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000002201';
const vaultId = '00000000-0000-4000-8000-000000002202';

const mocks = vi.hoisted(() => ({
  deleteWorkspaceIndex: vi.fn(),
  getWorkspaceIndexDetail: vi.fn(),
  loggerError: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
  requireSourceReadForRequest: vi.fn(),
  updateWorkspaceIndexMetadata: vi.fn(),
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  deleteWorkspaceIndex: mocks.deleteWorkspaceIndex,
  getWorkspaceIndexDetail: mocks.getWorkspaceIndexDetail,
  updateWorkspaceIndexMetadata: mocks.updateWorkspaceIndexMetadata,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
  requireSourceReadForRequest: mocks.requireSourceReadForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(
  options: Partial<{
    body: Record<string, unknown>;
    method: 'DELETE' | 'GET' | 'PATCH';
  }> = {},
): NextRequest {
  return new Request(`http://localhost:3000/api/workspace-indexes/${workspaceIndexId}`, {
    ...(options.body
      ? {
          body: JSON.stringify(options.body),
          headers: {
            'content-type': 'application/json',
          },
        }
      : {}),
    method: options.method ?? 'GET',
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
  mocks.requireSourceReadForRequest.mockResolvedValue({
    context: {
      permissions: ['sources.read'],
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
  mocks.requireSourceManagementForRequest.mockResolvedValue({
    context: {
      permissions: ['sources.manage'],
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
    sources: [],
    workspaceIndex: {
      description: 'Source-backed docs',
      id: workspaceIndexId,
      name: 'Engineering docs',
      vaultId,
    },
  });
  mocks.updateWorkspaceIndexMetadata.mockResolvedValue({
    description: null,
    id: workspaceIndexId,
    name: 'Delivery docs',
    vaultId,
  });
  mocks.deleteWorkspaceIndex.mockResolvedValue({
    id: workspaceIndexId,
    name: 'Engineering docs',
    vaultId,
  });
});

describe('/api/workspace-indexes/[workspaceIndexId]', () => {
  it('loads workspace index detail inside read scope', async () => {
    const response = await GET(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      detail: {
        workspaceIndex: {
          id: workspaceIndexId,
          name: 'Engineering docs',
        },
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.requireSourceReadForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      workspaceIndexId,
    });
    expect(mocks.getWorkspaceIndexDetail).toHaveBeenCalledWith(workspaceIndexId);
  });

  it('updates workspace index metadata with normalized description', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          description: '',
          name: 'Delivery docs',
        },
        method: 'PATCH',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workspaceIndex: {
        description: null,
        id: workspaceIndexId,
        name: 'Delivery docs',
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.updateWorkspaceIndexMetadata).toHaveBeenCalledWith(workspaceIndexId, {
      description: null,
      name: 'Delivery docs',
    });
  });

  it('deletes a workspace index inside management scope', async () => {
    const response = await DELETE(
      createRequest({
        method: 'DELETE',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.deleteWorkspaceIndex).toHaveBeenCalledWith(workspaceIndexId);
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
    expect(mocks.requireSourceReadForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid update bodies before writing', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          name: '',
        },
        method: 'PATCH',
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
    expect(mocks.updateWorkspaceIndexMetadata).not.toHaveBeenCalled();
  });

  it('returns not found for missing detail and delete targets', async () => {
    mocks.getWorkspaceIndexDetail.mockResolvedValue(null);
    mocks.deleteWorkspaceIndex.mockResolvedValue(null);

    const detailResponse = await GET(createRequest(), createContext());
    const deleteResponse = await DELETE(
      createRequest({
        method: 'DELETE',
      }),
      createContext(),
    );

    await expect(detailResponse.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    await expect(deleteResponse.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(detailResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });
});
