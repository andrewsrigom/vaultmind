import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, PATCH } from '@/app/api/chat-sessions/[chatSessionId]/route';

import type { NextRequest } from 'next/server';
import type { ChatSessionRouteContext } from '@/lib/api/request';

const chatSessionId = '00000000-0000-4000-8000-000000002301';
const workspaceIndexId = '00000000-0000-4000-8000-000000002302';
const vaultId = '00000000-0000-4000-8000-000000002303';

const mocks = vi.hoisted(() => ({
  deleteChatSession: vi.fn(),
  getChatSessionById: vi.fn(),
  loggerError: vi.fn(),
  requireApiAccessForRequest: vi.fn(),
  requireWorkspaceIndexDocsManagementForRequest: vi.fn(),
  updateChatSessionTitle: vi.fn(),
}));

vi.mock('@/db/queries/chat', () => ({
  deleteChatSession: mocks.deleteChatSession,
  getChatSessionById: mocks.getChatSessionById,
  updateChatSessionTitle: mocks.updateChatSessionTitle,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireApiAccessForRequest: mocks.requireApiAccessForRequest,
  requireWorkspaceIndexDocsManagementForRequest:
    mocks.requireWorkspaceIndexDocsManagementForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(
  options: Partial<{
    body: Record<string, unknown>;
    method: 'DELETE' | 'PATCH';
  }> = {},
): NextRequest {
  return new Request(`http://localhost:3000/api/chat-sessions/${chatSessionId}`, {
    ...(options.body
      ? {
          body: JSON.stringify(options.body),
          headers: {
            'content-type': 'application/json',
          },
        }
      : {}),
    method: options.method ?? 'PATCH',
  }) as NextRequest;
}

function createContext(
  overrides: Partial<{
    chatSessionId: string;
  }> = {},
): ChatSessionRouteContext {
  return {
    params: Promise.resolve({
      chatSessionId,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiAccessForRequest.mockResolvedValue({
    context: {
      permissions: [],
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
  mocks.getChatSessionById.mockResolvedValue({
    id: chatSessionId,
    title: 'Old title',
    workspaceIndexId,
  });
  mocks.requireWorkspaceIndexDocsManagementForRequest.mockResolvedValue({
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
    workspaceIndex: {
      id: workspaceIndexId,
      vaultId,
    },
  });
  mocks.updateChatSessionTitle.mockResolvedValue({
    id: chatSessionId,
    isPinned: true,
    title: 'Pinned readiness chat',
    workspaceIndexId,
  });
  mocks.deleteChatSession.mockResolvedValue({
    id: chatSessionId,
    title: 'Pinned readiness chat',
    workspaceIndexId,
  });
});

describe('/api/chat-sessions/[chatSessionId]', () => {
  it('updates chat session title and pinned state after workspace management auth', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          isPinned: true,
          title: 'Pinned readiness chat',
        },
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      chatSession: {
        id: chatSessionId,
        isPinned: true,
        title: 'Pinned readiness chat',
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.requireApiAccessForRequest).toHaveBeenCalledWith(expect.any(Request));
    expect(mocks.getChatSessionById).toHaveBeenCalledWith({ chatSessionId });
    expect(mocks.requireWorkspaceIndexDocsManagementForRequest).toHaveBeenCalledWith({
      request: expect.any(Request),
      workspaceIndexId,
    });
    expect(mocks.updateChatSessionTitle).toHaveBeenCalledWith({
      chatSessionId,
      isPinned: true,
      title: 'Pinned readiness chat',
    });
  });

  it('deletes a chat session after resolving its workspace scope', async () => {
    const response = await DELETE(
      createRequest({
        method: 'DELETE',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      chatSession: {
        id: chatSessionId,
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.deleteChatSession).toHaveBeenCalledWith({ chatSessionId });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          title: 'Pinned readiness chat',
        },
      }),
      createContext({
        chatSessionId: 'not-a-uuid',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireApiAccessForRequest).not.toHaveBeenCalled();
  });

  it('returns not found before workspace auth when the chat session is missing', async () => {
    mocks.getChatSessionById.mockResolvedValue(null);

    const response = await PATCH(
      createRequest({
        body: {
          title: 'Pinned readiness chat',
        },
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
    expect(mocks.requireWorkspaceIndexDocsManagementForRequest).not.toHaveBeenCalled();
    expect(mocks.updateChatSessionTitle).not.toHaveBeenCalled();
  });

  it('rejects empty update bodies before writing', async () => {
    const response = await PATCH(
      createRequest({
        body: {},
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
    expect(mocks.updateChatSessionTitle).not.toHaveBeenCalled();
  });

  it('maps update database failures to a safe response', async () => {
    mocks.updateChatSessionTitle.mockRejectedValue(new Error('database detail'));

    const response = await PATCH(
      createRequest({
        body: {
          title: 'Pinned readiness chat',
        },
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
      'Failed to update chat session.',
      expect.any(Error),
      {
        chatSessionId,
      },
    );
  });
});
