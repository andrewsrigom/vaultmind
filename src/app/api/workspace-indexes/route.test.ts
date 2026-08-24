import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/workspace-indexes/route';

import type { NextRequest } from 'next/server';

const vaultId = '00000000-0000-4000-8000-000000000801';

const mocks = vi.hoisted(() => ({
  createWorkspaceIndexWithGitHubSource: vi.fn(),
  listWorkspaceIndexes: vi.fn(),
  requireVaultAccessForRequest: vi.fn(),
  requireVaultSourceManagementForRequest: vi.fn(),
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  createWorkspaceIndexWithGitHubSource: mocks.createWorkspaceIndexWithGitHubSource,
  listWorkspaceIndexes: mocks.listWorkspaceIndexes,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultAccessForRequest: mocks.requireVaultAccessForRequest,
  requireVaultSourceManagementForRequest: mocks.requireVaultSourceManagementForRequest,
}));

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost:3000/api/workspace-indexes', {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  }) as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVaultSourceManagementForRequest.mockResolvedValue({
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
    vaultId,
  });
  mocks.createWorkspaceIndexWithGitHubSource.mockResolvedValue({
    source: {
      id: '00000000-0000-4000-8000-000000000803',
      name: 'openai/openai-cookbook',
      type: 'github',
    },
    workspaceIndex: {
      id: '00000000-0000-4000-8000-000000000802',
      name: 'Docs',
      vaultId,
    },
  });
});

describe('/api/workspace-indexes', () => {
  it('creates a GitHub workspace', async () => {
    const response = await POST(
      createRequest({
        branch: 'main',
        name: 'Docs',
        repoUrl: 'https://github.com/openai/openai-cookbook',
        vaultId,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workspaceIndex: {
        name: 'Docs',
      },
    });
    expect(response.status).toBe(201);
    expect(mocks.createWorkspaceIndexWithGitHubSource).toHaveBeenCalledWith(
      expect.objectContaining({
        parsedRepo: expect.objectContaining({
          owner: 'openai',
          repo: 'openai-cookbook',
        }),
        vaultId,
      }),
    );
  });
});
