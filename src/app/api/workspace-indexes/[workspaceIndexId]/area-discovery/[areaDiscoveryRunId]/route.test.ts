import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GET,
  PATCH,
} from '@/app/api/workspace-indexes/[workspaceIndexId]/area-discovery/[areaDiscoveryRunId]/route';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexAreaDiscoveryRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000002601';
const vaultId = '00000000-0000-4000-8000-000000002602';
const areaDiscoveryRunId = '00000000-0000-4000-8000-000000002603';
const suggestionId = '00000000-0000-4000-8000-000000002604';

const mocks = vi.hoisted(() => ({
  getAreaDiscoveryRunDetail: vi.fn(),
  loggerError: vi.fn(),
  requireAnalyticsManagementForRequest: vi.fn(),
  requireAnalyticsReadForRequest: vi.fn(),
  updatePendingAreaDiscoveryRunSuggestionsStatus: vi.fn(),
}));

vi.mock('@/db/queries/area-discovery', () => ({
  getAreaDiscoveryRunDetail: mocks.getAreaDiscoveryRunDetail,
  updatePendingAreaDiscoveryRunSuggestionsStatus:
    mocks.updatePendingAreaDiscoveryRunSuggestionsStatus,
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

function createRequest(
  options: Partial<{
    body: Record<string, unknown>;
    method: 'GET' | 'PATCH';
  }> = {},
): NextRequest {
  return new Request(
    `http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/area-discovery/${areaDiscoveryRunId}`,
    {
      ...(options.body
        ? {
            body: JSON.stringify(options.body),
            headers: {
              'content-type': 'application/json',
            },
          }
        : {}),
      method: options.method ?? 'GET',
    },
  ) as NextRequest;
}

function createContext(
  overrides: Partial<{
    areaDiscoveryRunId: string;
    workspaceIndexId: string;
  }> = {},
): WorkspaceIndexAreaDiscoveryRouteContext {
  return {
    params: Promise.resolve({
      areaDiscoveryRunId,
      workspaceIndexId,
      ...overrides,
    }),
  };
}

function createDetail() {
  return {
    run: {
      id: areaDiscoveryRunId,
      status: 'completed',
    },
    suggestions: [
      {
        id: suggestionId,
        status: 'suggested',
      },
    ],
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
  mocks.getAreaDiscoveryRunDetail.mockResolvedValue(createDetail());
  mocks.updatePendingAreaDiscoveryRunSuggestionsStatus.mockResolvedValue([
    {
      id: suggestionId,
      status: 'accepted',
    },
  ]);
});

describe('/api/workspace-indexes/[workspaceIndexId]/area-discovery/[areaDiscoveryRunId]', () => {
  it('loads area discovery run detail inside analytics read scope', async () => {
    const response = await GET(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      detail: {
        run: {
          id: areaDiscoveryRunId,
        },
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.getAreaDiscoveryRunDetail).toHaveBeenCalledWith({
      runId: areaDiscoveryRunId,
      workspaceIndexId,
    });
  });

  it('updates all pending suggestions for the discovery run', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          status: 'accepted',
        },
        method: 'PATCH',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      suggestions: [
        {
          id: suggestionId,
          status: 'accepted',
        },
      ],
    });
    expect(response.status).toBe(200);
    expect(mocks.updatePendingAreaDiscoveryRunSuggestionsStatus).toHaveBeenCalledWith({
      runId: areaDiscoveryRunId,
      status: 'accepted',
      workspaceIndexId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await GET(
      createRequest(),
      createContext({
        areaDiscoveryRunId: 'not-a-uuid',
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

  it('rejects invalid update bodies before writing', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          status: 'archived',
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
    expect(mocks.updatePendingAreaDiscoveryRunSuggestionsStatus).not.toHaveBeenCalled();
  });

  it('returns not found when the discovery run is outside the workspace', async () => {
    mocks.getAreaDiscoveryRunDetail.mockResolvedValue(null);

    const response = await GET(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
  });

  it('maps update failures to a safe database response', async () => {
    mocks.updatePendingAreaDiscoveryRunSuggestionsStatus.mockRejectedValue(
      new Error('database detail'),
    );

    const response = await PATCH(
      createRequest({
        body: {
          status: 'rejected',
        },
        method: 'PATCH',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'database-error',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to update area discovery suggestions.',
      expect.any(Error),
      {
        areaDiscoveryRunId,
        workspaceIndexId,
      },
    );
  });
});
