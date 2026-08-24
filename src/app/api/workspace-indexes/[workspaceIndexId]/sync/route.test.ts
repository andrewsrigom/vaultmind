import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/workspace-indexes/[workspaceIndexId]/sync/route';
import { SyncWorkspaceSourceError } from '@/lib/rag/sync-knowledge-source';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000001601';
const vaultId = '00000000-0000-4000-8000-000000001602';
const sourceId = '00000000-0000-4000-8000-000000001603';
const syncJobId = '00000000-0000-4000-8000-000000001604';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
  syncWorkspaceSource: vi.fn(),
}));

vi.mock('@/lib/access/api-access', () => ({
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

vi.mock('@/lib/rag/sync-knowledge-source', () => {
  class SyncWorkspaceSourceError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    syncWorkspaceSource: mocks.syncWorkspaceSource,
    SyncWorkspaceSourceError,
  };
});

function createRequest(body: Record<string, unknown> | null): NextRequest {
  return new Request(`http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/sync`, {
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: {
            'content-type': 'application/json',
          },
        }
      : {}),
    method: 'POST',
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

function createSyncResult() {
  return {
    summary: {
      chunksCreated: 3,
      documentsCreated: 1,
      documentsDeleted: 0,
      documentsUpdated: 0,
      skippedUnchanged: 2,
    },
    syncJob: {
      id: syncJobId,
      status: 'completed',
    },
    syncJobs: [
      {
        id: syncJobId,
        status: 'completed',
      },
    ],
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
  mocks.syncWorkspaceSource.mockResolvedValue(createSyncResult());
});

describe('/api/workspace-indexes/[workspaceIndexId]/sync', () => {
  it('syncs all sources when the request body is empty', async () => {
    const response = await POST(createRequest(null), createContext());

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      summary: {
        chunksCreated: 3,
        documentsCreated: 1,
      },
      syncJob: {
        id: syncJobId,
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.syncWorkspaceSource).toHaveBeenCalledWith({
      workspaceIndexId,
    });
  });

  it('syncs one selected source when sourceId is provided', async () => {
    const response = await POST(
      createRequest({
        sourceId,
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.syncWorkspaceSource).toHaveBeenCalledWith({
      sourceId,
      workspaceIndexId,
    });
  });

  it('streams sync progress and completion events', async () => {
    mocks.syncWorkspaceSource.mockImplementationOnce(
      async ({
        onProgress,
      }: {
        onProgress?: (progress: { phase: string }) => Promise<void> | void;
      }) => {
        await onProgress?.({
          phase: 'starting',
        });

        return createSyncResult();
      },
    );

    const response = await POST(
      createRequest({
        sourceId,
        stream: true,
      }),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const body = await response.text();
    expect(body).toContain('event: progress');
    expect(body).toContain('"phase":"starting"');
    expect(body).toContain('event: done');
    expect(body).toContain(syncJobId);
    expect(mocks.syncWorkspaceSource).toHaveBeenCalledWith({
      onProgress: expect.any(Function),
      sourceId,
      workspaceIndexId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await POST(
      createRequest({
        sourceId,
      }),
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
    expect(mocks.requireSourceManagementForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid source ids before syncing', async () => {
    const response = await POST(
      createRequest({
        sourceId: 'not-a-uuid',
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
    expect(mocks.syncWorkspaceSource).not.toHaveBeenCalled();
  });

  it('maps safe sync errors without logging internals', async () => {
    mocks.syncWorkspaceSource.mockRejectedValue(
      new SyncWorkspaceSourceError(
        'sync-already-running',
        'A sync is already running for this source.',
        409,
      ),
    );

    const response = await POST(
      createRequest({
        sourceId,
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'sync-already-running',
        message: 'A sync is already running for this source.',
      },
      ok: false,
    });
    expect(response.status).toBe(409);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('returns a safe conflict when the worker loses its sync lease', async () => {
    mocks.syncWorkspaceSource.mockRejectedValue(
      new SyncWorkspaceSourceError(
        'sync-lease-lost',
        'The sync lease expired before the job completed. Retry the sync.',
        409,
      ),
    );

    const response = await POST(
      createRequest({
        sourceId,
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'sync-lease-lost',
        message: 'The sync lease expired before the job completed. Retry the sync.',
      },
      ok: false,
    });
    expect(response.status).toBe(409);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('maps stream sync errors to a safe SSE error event', async () => {
    mocks.syncWorkspaceSource.mockRejectedValue(
      new SyncWorkspaceSourceError(
        'source-not-configured',
        'No syncable source is configured.',
        409,
      ),
    );

    const response = await POST(
      createRequest({
        stream: true,
      }),
      createContext(),
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('event: error');
    expect(body).toContain('No syncable source is configured.');
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
