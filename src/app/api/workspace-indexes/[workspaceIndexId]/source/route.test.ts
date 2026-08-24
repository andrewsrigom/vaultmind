import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH, POST } from '@/app/api/workspace-indexes/[workspaceIndexId]/source/route';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000001501';
const vaultId = '00000000-0000-4000-8000-000000001502';
const sourceId = '00000000-0000-4000-8000-000000001503';

const mocks = vi.hoisted(() => ({
  addGitHubSourceToWorkspaceIndex: vi.fn(),
  addGoogleDriveSourceToWorkspaceIndex: vi.fn(),
  addNotionSourceToWorkspaceIndex: vi.fn(),
  loggerError: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
  updatePrimarySourcePathFilters: vi.fn(),
  updateSourcePathFilters: vi.fn(),
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  addGitHubSourceToWorkspaceIndex: mocks.addGitHubSourceToWorkspaceIndex,
  addGoogleDriveSourceToWorkspaceIndex: mocks.addGoogleDriveSourceToWorkspaceIndex,
  addNotionSourceToWorkspaceIndex: mocks.addNotionSourceToWorkspaceIndex,
  updatePrimarySourcePathFilters: mocks.updatePrimarySourcePathFilters,
  updateSourcePathFilters: mocks.updateSourcePathFilters,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(
  body: Record<string, unknown>,
  options: Partial<{
    method: 'PATCH' | 'POST';
    sourceId: string;
  }> = {},
): NextRequest {
  const url = new URL(`http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/source`);

  if (options.sourceId) {
    url.searchParams.set('sourceId', options.sourceId);
  }

  const request = new Request(url, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: options.method ?? 'POST',
  }) as NextRequest;

  Object.defineProperty(request, 'nextUrl', {
    value: url,
  });

  return request;
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
  mocks.addGitHubSourceToWorkspaceIndex.mockResolvedValue({
    id: sourceId,
    name: 'openai/openai-cookbook',
    type: 'github',
    workspaceIndexId,
  });
  mocks.addNotionSourceToWorkspaceIndex.mockResolvedValue({
    id: sourceId,
    name: 'Notion',
    type: 'notion',
    workspaceIndexId,
  });
  mocks.addGoogleDriveSourceToWorkspaceIndex.mockResolvedValue({
    id: sourceId,
    name: 'Google Drive',
    type: 'google-drive',
    workspaceIndexId,
  });
  mocks.updatePrimarySourcePathFilters.mockResolvedValue({
    id: sourceId,
    includePaths: ['docs'],
    type: 'github',
    workspaceIndexId,
  });
  mocks.updateSourcePathFilters.mockResolvedValue({
    id: sourceId,
    includePaths: ['docs'],
    type: 'github',
    workspaceIndexId,
  });
});

describe('/api/workspace-indexes/[workspaceIndexId]/source', () => {
  it('creates a GitHub source with normalized path filters', async () => {
    const response = await POST(
      createRequest({
        branch: 'main',
        excludePaths: ['drafts//', '/tmp'],
        includePaths: ['/docs/', 'docs', 'packages/app'],
        repoUrl: 'https://github.com/openai/openai-cookbook',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      source: {
        id: sourceId,
        type: 'github',
      },
    });
    expect(response.status).toBe(201);
    expect(mocks.addGitHubSourceToWorkspaceIndex).toHaveBeenCalledWith({
      branch: 'main',
      excludePaths: ['drafts', 'tmp'],
      includePaths: ['docs', 'packages/app'],
      parsedRepo: expect.objectContaining({
        owner: 'openai',
        repo: 'openai-cookbook',
      }),
      workspaceIndexId,
    });
  });

  it('creates a Notion source with safe resource metadata', async () => {
    const response = await POST(
      createRequest({
        resources: [
          {
            externalId: 'page_123',
            lastEditedTime: '2026-06-20T10:00:00.000Z',
            title: 'Delivery Handbook',
            type: 'page',
            url: 'https://notion.so/page_123',
          },
        ],
        sourceType: 'notion',
        workspaceId: 'workspace_123',
        workspaceName: 'Product',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      source: {
        type: 'notion',
      },
    });
    expect(response.status).toBe(201);
    expect(mocks.addNotionSourceToWorkspaceIndex).toHaveBeenCalledWith({
      resources: [
        {
          externalId: 'page_123',
          lastEditedTime: '2026-06-20T10:00:00.000Z',
          title: 'Delivery Handbook',
          type: 'page',
          url: 'https://notion.so/page_123',
        },
      ],
      workspaceId: 'workspace_123',
      workspaceIndexId,
      workspaceName: 'Product',
    });
  });

  it('rejects unsupported GitHub repository hosts before writing', async () => {
    const response = await POST(
      createRequest({
        repoUrl: 'https://gitlab.com/openai/openai-cookbook',
      }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'unsupported-github-host',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.addGitHubSourceToWorkspaceIndex).not.toHaveBeenCalled();
  });

  it('rejects invalid route params before auth', async () => {
    const response = await POST(
      createRequest({
        repoUrl: 'https://github.com/openai/openai-cookbook',
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

  it('updates filters on the primary source when no source id is provided', async () => {
    const response = await PATCH(
      createRequest(
        {
          excludePaths: ['drafts'],
          includePaths: ['/docs/'],
        },
        { method: 'PATCH' },
      ),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      source: {
        id: sourceId,
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.updatePrimarySourcePathFilters).toHaveBeenCalledWith(workspaceIndexId, {
      excludePaths: ['drafts'],
      includePaths: ['docs'],
    });
    expect(mocks.updateSourcePathFilters).not.toHaveBeenCalled();
  });

  it('updates filters on a selected source when sourceId is provided', async () => {
    const response = await PATCH(
      createRequest(
        {
          excludePaths: [],
          includePaths: ['docs'],
        },
        { method: 'PATCH', sourceId },
      ),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      source: {
        id: sourceId,
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.updateSourcePathFilters).toHaveBeenCalledWith(workspaceIndexId, sourceId, {
      excludePaths: [],
      includePaths: ['docs'],
    });
  });

  it('rejects invalid sourceId query params before updating', async () => {
    const response = await PATCH(
      createRequest(
        {
          includePaths: ['docs'],
        },
        { method: 'PATCH', sourceId: 'not-a-uuid' },
      ),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.updateSourcePathFilters).not.toHaveBeenCalled();
  });
});
