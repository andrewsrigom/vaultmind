import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '@/app/api/workspace-indexes/[workspaceIndexId]/area-discovery/route';
import { AreaDiscoveryError } from '@/lib/rag/discover-knowledge-areas';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000002501';
const vaultId = '00000000-0000-4000-8000-000000002502';
const runId = '00000000-0000-4000-8000-000000002503';

const mocks = vi.hoisted(() => ({
  createAreaDiscoveryRun: vi.fn(),
  listAreaDiscoveryRuns: vi.fn(),
  loggerError: vi.fn(),
  requireAnalyticsManagementForRequest: vi.fn(),
  requireAnalyticsReadForRequest: vi.fn(),
  runAreaDiscovery: vi.fn(),
}));

vi.mock('@/db/queries/area-discovery', () => ({
  createAreaDiscoveryRun: mocks.createAreaDiscoveryRun,
  listAreaDiscoveryRuns: mocks.listAreaDiscoveryRuns,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireAnalyticsManagementForRequest: mocks.requireAnalyticsManagementForRequest,
  requireAnalyticsReadForRequest: mocks.requireAnalyticsReadForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

vi.mock('@/lib/rag/discover-knowledge-areas', () => {
  class AreaDiscoveryError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    AreaDiscoveryError,
    runAreaDiscovery: mocks.runAreaDiscovery,
  };
});

function createRequest(method: 'GET' | 'POST'): NextRequest {
  return new Request(
    `http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/area-discovery`,
    {
      method,
    },
  ) as NextRequest;
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
  mocks.requireAnalyticsReadForRequest.mockResolvedValue({
    context: {
      permissions: ['analytics.read'],
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
  mocks.requireAnalyticsManagementForRequest.mockResolvedValue({
    context: {
      permissions: ['analytics.manage'],
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
  mocks.listAreaDiscoveryRuns.mockResolvedValue([
    {
      id: runId,
      status: 'completed',
      workspaceIndexId,
    },
  ]);
  mocks.createAreaDiscoveryRun.mockResolvedValue({
    id: runId,
    status: 'running',
    workspaceIndexId,
  });
  mocks.runAreaDiscovery.mockResolvedValue({
    run: {
      id: runId,
      status: 'completed',
    },
    suggestions: [],
  });
});

describe('/api/workspace-indexes/[workspaceIndexId]/area-discovery', () => {
  it('lists area discovery runs inside analytics read scope', async () => {
    const response = await GET(createRequest('GET'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      areaDiscoveryRuns: [
        {
          id: runId,
          status: 'completed',
        },
      ],
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.listAreaDiscoveryRuns).toHaveBeenCalledWith({ workspaceIndexId });
  });

  it('creates and runs area discovery inside analytics management scope', async () => {
    const response = await POST(createRequest('POST'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      detail: {
        run: {
          id: runId,
        },
      },
      ok: true,
    });
    expect(response.status).toBe(201);
    expect(mocks.createAreaDiscoveryRun).toHaveBeenCalledWith({ workspaceIndexId });
    expect(mocks.runAreaDiscovery).toHaveBeenCalledWith({
      runId,
      workspaceIndexId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await GET(
      createRequest('GET'),
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
    expect(mocks.requireAnalyticsReadForRequest).not.toHaveBeenCalled();
  });

  it('returns not found when a discovery run cannot be created', async () => {
    mocks.createAreaDiscoveryRun.mockResolvedValue(null);

    const response = await POST(createRequest('POST'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
    expect(mocks.runAreaDiscovery).not.toHaveBeenCalled();
  });

  it('maps area discovery errors to safe API errors', async () => {
    mocks.runAreaDiscovery.mockRejectedValue(
      new AreaDiscoveryError(
        'area-discovery-no-documents',
        'No documents are available for area discovery.',
        409,
      ),
    );

    const response = await POST(createRequest('POST'), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'area-discovery-no-documents',
        message: 'No documents are available for area discovery.',
      },
      ok: false,
    });
    expect(response.status).toBe(409);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
