import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/workspace-indexes/[workspaceIndexId]/chat/feedback/route';

import type { WorkspaceIndexRouteContext } from '@/lib/api/request';
import type { NextRequest } from 'next/server';

const vaultId = '00000000-0000-4000-8000-000000000831';
const workspaceIndexId = '00000000-0000-4000-8000-000000000832';
const assistantMessageId = '00000000-0000-4000-8000-000000000833';
const workspaceAreaId = '00000000-0000-4000-8000-000000000839';

const mocks = vi.hoisted(() => ({
  createTrustSignalEvent: vi.fn(),
  loggerError: vi.fn(),
  requireWorkspaceIndexDocsReadForRequest: vi.fn(),
}));

vi.mock('@/db/queries/knowledge-events', () => ({
  createTrustSignalEvent: mocks.createTrustSignalEvent,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireWorkspaceIndexDocsReadForRequest: mocks.requireWorkspaceIndexDocsReadForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(
    `http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/chat/feedback`,
    {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    },
  ) as NextRequest;
}

function createContext(): WorkspaceIndexRouteContext {
  return {
    params: Promise.resolve({
      workspaceIndexId,
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
  mocks.createTrustSignalEvent.mockResolvedValue({
    event: {
      id: '00000000-0000-4000-8000-000000000837',
      type: 'trust-signal-submitted',
      workspaceIndexId,
    },
    status: 'created',
  });
});

describe('/api/workspace-indexes/[workspaceIndexId]/chat/feedback', () => {
  it('records assistant feedback', async () => {
    const response = await POST(
      createRequest({
        chatMessageId: assistantMessageId,
        signal: 'missing-source',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      event: {
        type: 'trust-signal-submitted',
        workspaceIndexId,
      },
      ok: true,
    });
    expect(response.status).toBe(201);
    expect(mocks.createTrustSignalEvent).toHaveBeenCalledWith({
      chatMessageId: assistantMessageId,
      signal: 'missing-source',
      workspaceAreaId: null,
      workspaceIndexId,
    });
  });

  it('passes area context through feedback', async () => {
    const response = await POST(
      createRequest({
        chatMessageId: assistantMessageId,
        signal: 'wrong-scope',
        workspaceAreaId,
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
    });
    expect(response.status).toBe(201);
    expect(mocks.createTrustSignalEvent).toHaveBeenCalledWith({
      chatMessageId: assistantMessageId,
      signal: 'wrong-scope',
      workspaceAreaId,
      workspaceIndexId,
    });
  });

  it('rejects feedback on a non-assistant message', async () => {
    mocks.createTrustSignalEvent.mockResolvedValueOnce({
      reason: 'message-not-assistant',
      status: 'not-created',
    });

    const response = await POST(
      createRequest({
        chatMessageId: assistantMessageId,
        signal: 'missing-source',
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
  });

  it('rejects feedback with an area outside the vault', async () => {
    mocks.createTrustSignalEvent.mockResolvedValueOnce({
      reason: 'area-not-found',
      status: 'not-created',
    });

    const response = await POST(
      createRequest({
        chatMessageId: assistantMessageId,
        signal: 'wrong-scope',
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
