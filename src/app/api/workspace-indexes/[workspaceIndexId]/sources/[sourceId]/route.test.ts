import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from '@/app/api/workspace-indexes/[workspaceIndexId]/sources/[sourceId]/route';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexSourceRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000001701';
const vaultId = '00000000-0000-4000-8000-000000001702';
const sourceId = '00000000-0000-4000-8000-000000001703';

const mocks = vi.hoisted(() => ({
  deleteWorkspaceSource: vi.fn(),
  loggerError: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  deleteWorkspaceSource: mocks.deleteWorkspaceSource,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(): NextRequest {
  return new Request(
    `http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/sources/${sourceId}`,
    {
      method: 'DELETE',
    },
  ) as NextRequest;
}

function createContext(
  overrides: Partial<{
    sourceId: string;
    workspaceIndexId: string;
  }> = {},
): WorkspaceIndexSourceRouteContext {
  return {
    params: Promise.resolve({
      sourceId,
      workspaceIndexId,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.deleteWorkspaceSource.mockResolvedValue({
    id: sourceId,
    name: 'Engineering docs',
    type: 'github',
    workspaceIndexId,
  });
});

describe('/api/workspace-indexes/[workspaceIndexId]/sources/[sourceId]', () => {
  it('deletes a source within the workspace scope', async () => {
    const response = await DELETE(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      source: {
        id: sourceId,
        name: 'Engineering docs',
        type: 'github',
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.requireSourceManagementForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      workspaceIndexId,
    });
    expect(mocks.deleteWorkspaceSource).toHaveBeenCalledWith({
      sourceId,
      workspaceIndexId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await DELETE(
      createRequest(),
      createContext({
        sourceId: 'not-a-uuid',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireSourceManagementForRequest).not.toHaveBeenCalled();
  });

  it('returns not found when the source is outside the workspace', async () => {
    mocks.deleteWorkspaceSource.mockResolvedValue(null);

    const response = await DELETE(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
  });

  it('maps unexpected delete errors to a safe response', async () => {
    mocks.deleteWorkspaceSource.mockRejectedValue(new Error('database detail'));

    const response = await DELETE(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'unexpected-error',
        message:
          'Could not delete this source. Check the local PostgreSQL container and try again.',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to delete workspace source.',
      expect.any(Error),
      {
        sourceId,
        workspaceIndexId,
      },
    );
  });
});
