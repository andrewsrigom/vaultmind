import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DELETE,
  PATCH,
} from '@/app/api/workspace-indexes/[workspaceIndexId]/articles/[articleId]/route';

import type { ArticleRouteContext } from '@/lib/api/request';
import type { NextRequest } from 'next/server';

const workspaceIndexId = '00000000-0000-4000-8000-000000003101';
const vaultId = '00000000-0000-4000-8000-000000003102';
const articleId = '00000000-0000-4000-8000-000000003103';
const areaId = '00000000-0000-4000-8000-000000003104';
const mocks = vi.hoisted(() => ({
  deleteArticle: vi.fn(),
  loggerError: vi.fn(),
  requireWorkspaceIndexDocsManagementForRequest: vi.fn(),
  updateArticle: vi.fn(),
}));

vi.mock('@/db/queries/articles', () => ({
  deleteArticle: mocks.deleteArticle,
  updateArticle: mocks.updateArticle,
}));

vi.mock('@/lib/access/api-access', () => ({
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
  return new Request(
    `http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/articles/${articleId}`,
    {
      ...(options.body
        ? {
            body: JSON.stringify(options.body),
            headers: {
              'content-type': 'application/json',
            },
          }
        : {}),
      method: options.method ?? 'PATCH',
    },
  ) as NextRequest;
}

function createContext(
  overrides: Partial<{
    articleId: string;
    workspaceIndexId: string;
  }> = {},
): ArticleRouteContext {
  return {
    params: Promise.resolve({
      articleId,
      workspaceIndexId,
      ...overrides,
    }),
  };
}

function createArticle() {
  return {
    content: 'Run the documented export command.',
    id: articleId,
    question: 'How should exports work?',
    status: 'needs-update',
    workspaceAreaId: areaId,
    workspaceIndexId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.updateArticle.mockResolvedValue(createArticle());
  mocks.deleteArticle.mockResolvedValue(createArticle());
});

describe('/api/workspace-indexes/[workspaceIndexId]/articles/[articleId]', () => {
  it('updates an article', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          content: 'Run the documented export command.',
          question: 'How should exports work?',
          status: 'needs-update',
        },
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      article: {
        id: articleId,
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.updateArticle).toHaveBeenCalledWith({
      articleId,
      content: 'Run the documented export command.',
      question: 'How should exports work?',
      status: 'needs-update',
      workspaceIndexId,
    });
  });

  it('deletes an article inside docs management scope', async () => {
    const response = await DELETE(
      createRequest({
        method: 'DELETE',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      article: {
        id: articleId,
      },
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.deleteArticle).toHaveBeenCalledWith({
      articleId,
      workspaceIndexId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          content: 'Content',
          question: 'Question',
        },
      }),
      createContext({
        articleId: 'not-a-uuid',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireWorkspaceIndexDocsManagementForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid update bodies before writing', async () => {
    const response = await PATCH(
      createRequest({
        body: {
          content: '',
          question: 'Question',
        },
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
    expect(mocks.updateArticle).not.toHaveBeenCalled();
  });

  it('returns not found when an article is outside the workspace scope', async () => {
    mocks.updateArticle.mockResolvedValue(null);

    const response = await PATCH(
      createRequest({
        body: {
          content: 'Content',
          question: 'Question',
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
  });
});
