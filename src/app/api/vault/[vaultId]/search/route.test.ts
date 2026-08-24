import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/vault/[vaultId]/search/route';

import type { NextRequest } from 'next/server';
import type { RouteContext } from '@/lib/api/request';
import type { VaultSearchRouteParams } from '@/lib/validators/search';

const vaultId = '00000000-0000-4000-8000-000000002001';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  requireVaultDocsReadForRequest: vi.fn(),
  searchVaultKnowledge: vi.fn(),
}));

vi.mock('@/db/queries/search', () => ({
  searchVaultKnowledge: mocks.searchVaultKnowledge,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsReadForRequest: mocks.requireVaultDocsReadForRequest,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function createRequest(query = 'readiness'): NextRequest {
  const url = new URL(`http://localhost:3000/api/vault/${vaultId}/search`);
  url.searchParams.set('q', query);
  const request = new Request(url, {
    method: 'GET',
  }) as NextRequest;

  Object.defineProperty(request, 'nextUrl', {
    value: url,
  });

  return request;
}

function createContext(
  overrides: Partial<{
    vaultId: string;
  }> = {},
): RouteContext<VaultSearchRouteParams> {
  return {
    params: Promise.resolve({
      vaultId,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVaultDocsReadForRequest.mockResolvedValue({
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
    vaultId,
  });
  mocks.searchVaultKnowledge.mockResolvedValue({
    entries: [
      {
        id: 'entry_1',
        kind: 'workspace-doc',
        title: 'Readiness checklist',
        updatedAt: new Date('2026-06-20T12:00:00.000Z'),
      },
    ],
    sourceCount: 3,
  });
});

describe('/api/vault/[vaultId]/search', () => {
  it('searches vault knowledge and serializes timestamps', async () => {
    const response = await GET(createRequest(' readiness '), createContext());

    await expect(response.json()).resolves.toMatchObject({
      entries: [
        {
          id: 'entry_1',
          title: 'Readiness checklist',
          updatedAt: '2026-06-20T12:00:00.000Z',
        },
      ],
      ok: true,
      sourceCount: 3,
    });
    expect(response.status).toBe(200);
    expect(mocks.searchVaultKnowledge).toHaveBeenCalledWith({
      query: 'readiness',
      vaultId,
    });
  });

  it('rejects invalid route params before auth', async () => {
    const response = await GET(
      createRequest(),
      createContext({
        vaultId: 'not-a-uuid',
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireVaultDocsReadForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid search queries before hitting the database', async () => {
    const response = await GET(createRequest('x'.repeat(201)), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalid-input',
      },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.searchVaultKnowledge).not.toHaveBeenCalled();
  });

  it('maps search failures to a safe response', async () => {
    mocks.searchVaultKnowledge.mockRejectedValue(new Error('database detail'));

    const response = await GET(createRequest(), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'unexpected-error',
      },
      ok: false,
    });
    expect(response.status).toBe(500);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to search vault knowledge.',
      expect.any(Error),
      {
        vaultId,
      },
    );
  });
});
