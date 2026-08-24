import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '@/app/api/workspace-indexes/[workspaceIndexId]/articles/route';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000003001';
const vaultId = '00000000-0000-4000-8000-000000003002';
const articleId = '00000000-0000-4000-8000-000000003003';
const areaId = '00000000-0000-4000-8000-000000003004';
const assistantMessageId = '00000000-0000-4000-8000-000000003005';

const mocks = vi.hoisted(() => ({
  createArticle: vi.fn(),
  listArticles: vi.fn(),
  loggerError: vi.fn(),
  promoteAssistantMessageToArticle: vi.fn(),
  requireWorkspaceIndexDocsCreationForRequest: vi.fn(),
  requireWorkspaceIndexDocsReadForRequest: vi.fn(),
}));

vi.mock('@/db/queries/articles', () => ({
  createArticle: mocks.createArticle,
  listArticles: mocks.listArticles,
  promoteAssistantMessageToArticle: mocks.promoteAssistantMessageToArticle,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireWorkspaceIndexDocsCreationForRequest: mocks.requireWorkspaceIndexDocsCreationForRequest,
  requireWorkspaceIndexDocsReadForRequest: mocks.requireWorkspaceIndexDocsReadForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createGetRequest(
  params: Partial<{
    areaId: string;
    status: string;
  }> = {},
): NextRequest {
  const url = new URL(`http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/articles`);

  if (params.areaId) {
    url.searchParams.set('areaId', params.areaId);
  }

  if (params.status) {
    url.searchParams.set('status', params.status);
  }

  const request = new Request(url, {
    method: 'GET',
  }) as NextRequest;

  Object.defineProperty(request, 'nextUrl', {
    value: url,
  });

  return request;
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/articles`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
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

function createArticleRecord() {
  return {
    content: 'Use the search readiness checklist.',
    id: articleId,
    question: 'How should search readiness work?',
    status: 'draft',
    workspaceAreaId: areaId,
    workspaceIndexId,
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
  mocks.requireWorkspaceIndexDocsCreationForRequest.mockResolvedValue({
    context: {
      permissions: ['docs.create'],
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
  mocks.listArticles.mockResolvedValue([createArticleRecord()]);
  mocks.createArticle.mockResolvedValue(createArticleRecord());
  mocks.promoteAssistantMessageToArticle.mockResolvedValue({
    article: createArticleRecord(),
    status: 'created',
  });
});

describe('/api/workspace-indexes/[workspaceIndexId]/articles', () => {
  it('lists articles with optional area and status filters', async () => {
    const response = await GET(
      createGetRequest({
        areaId,
        status: 'draft',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      articles: [
        {
          id: articleId,
          question: 'How should search readiness work?',
        },
      ],
      ok: true,
    });
    expect(response.status).toBe(200);
    expect(mocks.listArticles).toHaveBeenCalledWith({
      status: 'draft',
      workspaceAreaId: areaId,
      workspaceIndexId,
    });
  });

  it('creates a manual article draft', async () => {
    const response = await POST(
      createPostRequest({
        areaId,
        content: 'Use the search readiness checklist.',
        question: 'How should search readiness work?',
        status: 'draft',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      article: {
        id: articleId,
      },
      ok: true,
      status: 'created',
    });
    expect(response.status).toBe(201);
    expect(mocks.createArticle).toHaveBeenCalledWith({
      content: 'Use the search readiness checklist.',
      question: 'How should search readiness work?',
      status: 'draft',
      workspaceAreaId: areaId,
      workspaceIndexId,
    });
  });

  it('promotes an assistant message to an article', async () => {
    const response = await POST(
      createPostRequest({
        assistantMessageId,
        status: 'in-review',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      article: {
        id: articleId,
      },
      ok: true,
      status: 'created',
    });
    expect(response.status).toBe(201);
    expect(mocks.promoteAssistantMessageToArticle).toHaveBeenCalledWith({
      assistantMessageId,
      status: 'in-review',
      workspaceAreaId: null,
      workspaceIndexId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await GET(
      createGetRequest(),
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

  it('rejects invalid query filters before listing articles', async () => {
    const response = await GET(
      createGetRequest({
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
    expect(mocks.listArticles).not.toHaveBeenCalled();
  });

  it('maps promotion not-created reasons to explicit API errors', async () => {
    mocks.promoteAssistantMessageToArticle.mockResolvedValue({
      reason: 'message-not-assistant',
      status: 'not-created',
    });

    const response = await POST(
      createPostRequest({
        assistantMessageId,
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
        message: 'Only assistant messages can be promoted to articles.',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
  });
});
