import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/workspace-indexes/[workspaceIndexId]/sources/[sourceId]/test/route';
import { SourceCredentialError } from '@/db/queries/source-credentials';
import { SourceAdapterError } from '@/lib/sources/errors';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexSourceRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000001801';
const vaultId = '00000000-0000-4000-8000-000000001802';
const sourceId = '00000000-0000-4000-8000-000000001803';

const db = {
  kind: 'db',
};

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getSourceAdapter: vi.fn(),
  getSourceCredentialSecret: vi.fn(),
  getSyncableWorkspaceSource: vi.fn(),
  listResources: vi.fn(),
  loggerError: vi.fn(),
  requireSourceManagementForRequest: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/db/queries/source-credentials', () => {
  class SourceCredentialError extends Error {
    code: 'source-credential-decryption-failed' | 'source-credential-key-missing';
    status: number;

    constructor(code: SourceCredentialError['code'], message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    getSourceCredentialSecret: mocks.getSourceCredentialSecret,
    SourceCredentialError,
  };
});

vi.mock('@/db/queries/sync-jobs', () => ({
  getSyncableWorkspaceSource: mocks.getSyncableWorkspaceSource,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireSourceManagementForRequest: mocks.requireSourceManagementForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

vi.mock('@/lib/sources/registry', () => ({
  getSourceAdapter: mocks.getSourceAdapter,
}));

function createRequest(): NextRequest {
  return new Request(
    `http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/sources/${sourceId}/test`,
    {
      method: 'POST',
    },
  ) as NextRequest;
}

function createContext(
  overrides: Partial<{
    sourceId: string;
    workspaceIndexId: string;
  }> = {},
): WorkspaceIndexSourceRouteContext {
  return {
    params: Promise.resolve({
      sourceId,
      workspaceIndexId,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockReturnValue(db);
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
  mocks.getSyncableWorkspaceSource.mockResolvedValue({
    id: sourceId,
    name: 'Engineering docs',
    type: 'notion',
    workspaceIndexId,
  });
  mocks.getSourceCredentialSecret.mockResolvedValue({
    accessToken: 'token_value',
    expiresAt: null,
    refreshToken: null,
  });
  mocks.listResources.mockResolvedValue([
    {
      externalId: 'page_123',
      title: 'Delivery Handbook',
      type: 'page',
    },
    {
      externalId: 'page_456',
      title: 'Readiness Checklist',
      type: 'page',
    },
  ]);
  mocks.getSourceAdapter.mockReturnValue({
    listResources: mocks.listResources,
    loadDocuments: vi.fn(),
    type: 'notion',
  });
});

describe('/api/workspace-indexes/[workspaceIndexId]/sources/[sourceId]/test', () => {
  it('tests a source connection with decrypted credentials', async () => {
    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      resourceCount: 2,
      source: {
        id: sourceId,
        name: 'Engineering docs',
        type: 'notion',
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.getSyncableWorkspaceSource).toHaveBeenCalledWith({
      db,
      sourceId,
      workspaceIndexId,
    });
    expect(mocks.getSourceCredentialSecret).toHaveBeenCalledWith({
      db,
      sourceId,
    });
    expect(mocks.listResources).toHaveBeenCalledWith({
      credential: {
        accessToken: 'token_value',
        expiresAt: null,
        refreshToken: null,
      },
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await POST(
      createRequest(),
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

  it('returns not found when the source is outside the workspace', async () => {
    mocks.getSyncableWorkspaceSource.mockResolvedValue(null);

    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'not-found',
      },
      ok: false,
    });
    expect(response.status).toBe(404);
    expect(mocks.getSourceAdapter).not.toHaveBeenCalled();
  });

  it('rejects source types that do not support connection testing', async () => {
    mocks.getSourceAdapter.mockReturnValue({
      loadDocuments: vi.fn(),
      type: 'github',
    });

    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
        message: 'This source type does not support connection testing.',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.getSourceCredentialSecret).not.toHaveBeenCalled();
  });

  it('maps credential errors without calling the adapter', async () => {
    mocks.getSourceCredentialSecret.mockRejectedValue(
      new SourceCredentialError(
        'source-credential-decryption-failed',
        'Source credentials could not be decrypted. Reconnect this source and try again.',
        401,
      ),
    );

    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'source-credential-decryption-failed',
      },
      ok: false,
    });
    expect(response.status).toBe(401);
    expect(mocks.listResources).not.toHaveBeenCalled();
  });

  it('maps adapter errors to safe API errors', async () => {
    mocks.listResources.mockRejectedValue(
      new SourceAdapterError(
        'notion-unauthorized',
        'Reconnect Notion before listing resources.',
        401,
      ),
    );

    const response = await POST(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'notion-unauthorized',
        message: 'Reconnect Notion before listing resources.',
      },
      ok: false,
    });
    expect(response.status).toBe(401);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
