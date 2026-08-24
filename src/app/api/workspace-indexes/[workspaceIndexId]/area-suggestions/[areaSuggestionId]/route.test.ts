import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from '@/app/api/workspace-indexes/[workspaceIndexId]/area-suggestions/[areaSuggestionId]/route';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexAreaSuggestionRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000002701';
const vaultId = '00000000-0000-4000-8000-000000002702';
const areaSuggestionId = '00000000-0000-4000-8000-000000002703';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  requireAnalyticsManagementForRequest: vi.fn(),
  updateAreaSuggestionStatus: vi.fn(),
}));

vi.mock('@/db/queries/area-discovery', () => ({
  updateAreaSuggestionStatus: mocks.updateAreaSuggestionStatus,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireAnalyticsManagementForRequest: mocks.requireAnalyticsManagementForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(
    `http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/area-suggestions/${areaSuggestionId}`,
    {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
      },
      method: 'PATCH',
    },
  ) as NextRequest;
}

function createContext(
  overrides: Partial<{
    areaSuggestionId: string;
    workspaceIndexId: string;
  }> = {},
): WorkspaceIndexAreaSuggestionRouteContext {
  return {
    params: Promise.resolve({
      areaSuggestionId,
      workspaceIndexId,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.updateAreaSuggestionStatus.mockResolvedValue({
    id: areaSuggestionId,
    status: 'accepted',
    workspaceIndexId,
  });
});

describe('/api/workspace-indexes/[workspaceIndexId]/area-suggestions/[areaSuggestionId]', () => {
  it('updates an area suggestion status inside analytics management scope', async () => {
    const response = await PATCH(
      createRequest({
        status: 'accepted',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      suggestion: {
        id: areaSuggestionId,
        status: 'accepted',
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.updateAreaSuggestionStatus).toHaveBeenCalledWith({
      status: 'accepted',
      suggestionId: areaSuggestionId,
      workspaceIndexId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await PATCH(
      createRequest({
        status: 'accepted',
      }),
      createContext({
        areaSuggestionId: 'not-a-uuid',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireAnalyticsManagementForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid bodies before updating', async () => {
    const response = await PATCH(
      createRequest({
        status: 'archived',
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
    expect(mocks.updateAreaSuggestionStatus).not.toHaveBeenCalled();
  });

  it('returns not found when the suggestion is outside the workspace', async () => {
    mocks.updateAreaSuggestionStatus.mockResolvedValue(null);

    const response = await PATCH(
      createRequest({
        status: 'rejected',
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

  it('maps update failures to a safe database response', async () => {
    mocks.updateAreaSuggestionStatus.mockRejectedValue(new Error('database detail'));

    const response = await PATCH(
      createRequest({
        status: 'rejected',
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
      'Failed to update area suggestion.',
      expect.any(Error),
      {
        areaSuggestionId,
        workspaceIndexId,
      },
    );
  });
});
