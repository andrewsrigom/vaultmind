import { describe, expect, it } from 'vitest';

import { createNotionSourceAdapter } from '@/lib/sources/notion/notion-source-adapter';

import type { SourceAdapterError } from '@/lib/sources/errors';
import type { NotionFetch } from '@/lib/sources/notion/notion-api';

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });
}

function createMockNotionFetch(): NotionFetch {
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (url.endsWith('/search')) {
      return createJsonResponse({
        has_more: false,
        next_cursor: null,
        object: 'list',
        results: [
          {
            id: 'b55c9c91-384d-452b-81db-d1ef79372b75',
            last_edited_time: '2026-06-24T12:00:00.000Z',
            object: 'page',
            properties: {
              title: {
                title: [{ plain_text: 'Notion Roadmap' }],
                type: 'title',
              },
            },
            url: 'https://www.notion.so/Notion-Roadmap-b55c9c91384d452b81dbd1ef79372b75',
          },
        ],
      });
    }

    if (url.endsWith('/pages/b55c9c91384d452b81dbd1ef79372b75/markdown')) {
      return createJsonResponse({
        id: 'b55c9c91-384d-452b-81db-d1ef79372b75',
        markdown: 'The Notion connector should index selected pages.',
        object: 'page_markdown',
        truncated: false,
        unknown_block_ids: [],
      });
    }

    return createJsonResponse({ message: 'not found' }, 404);
  };
}

function createEmptySearchFetch(): NotionFetch {
  return async () =>
    createJsonResponse({
      has_more: false,
      next_cursor: null,
      object: 'list',
      results: [],
    });
}

function createStatusFetch(status: number): NotionFetch {
  return async () => createJsonResponse({ message: 'provider error' }, status);
}

describe('createNotionSourceAdapter', () => {
  it('requires an OAuth credential before loading documents', async () => {
    const adapter = createNotionSourceAdapter();

    await expect(
      adapter.loadDocuments({
        resources: [],
      }),
    ).rejects.toMatchObject({
      code: 'notion-not-connected',
      status: 401,
    } satisfies Partial<SourceAdapterError>);
  });

  it('lists shared pages and normalizes them into source documents', async () => {
    const adapter = createNotionSourceAdapter({
      fetchFn: createMockNotionFetch(),
    });
    const context = {
      credential: {
        accessToken: 'notion-access-token',
      },
    };
    const resources = await adapter.listResources?.(context);

    expect(resources).toEqual([
      {
        externalId: 'b55c9c91-384d-452b-81db-d1ef79372b75',
        lastEditedTime: '2026-06-24T12:00:00.000Z',
        title: 'Notion Roadmap',
        type: 'page',
        url: 'https://www.notion.so/Notion-Roadmap-b55c9c91384d452b81dbd1ef79372b75',
      },
    ]);

    const result = await adapter.loadDocuments(
      {
        resources: [],
        workspaceId: 'workspace-id',
        workspaceName: 'Product Docs',
      },
      context,
    );

    expect(result.externalVersion).toBe('2026-06-24T12:00:00.000Z');
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      content: '# Notion Roadmap\n\nThe Notion connector should index selected pages.',
      externalId: 'notion:page:b55c9c91-384d-452b-81db-d1ef79372b75',
      externalUrl: 'https://www.notion.so/Notion-Roadmap-b55c9c91384d452b81dbd1ef79372b75',
      path: 'notion/notion-roadmap-b55c9c91384d.md',
      title: 'Notion Roadmap',
      updatedAt: '2026-06-24T12:00:00.000Z',
    });
    expect(result.documents[0]?.contentHash).toHaveLength(64);
    expect(result.metadata).toMatchObject({
      pageCount: 1,
      sourceType: 'notion',
      workspaceId: 'workspace-id',
      workspaceName: 'Product Docs',
    });
  });

  it('returns a safe unauthorized error when Notion rejects the credential', async () => {
    const adapter = createNotionSourceAdapter({
      fetchFn: createStatusFetch(401),
    });

    await expect(
      adapter.listResources?.({
        credential: {
          accessToken: 'revoked-token',
        },
      }),
    ).rejects.toMatchObject({
      code: 'notion-unauthorized',
      message: 'Notion rejected this connection. Reconnect Notion and try again.',
      status: 401,
    } satisfies Partial<SourceAdapterError>);
  });

  it('returns a safe empty-access error when no readable pages are shared', async () => {
    const adapter = createNotionSourceAdapter({
      fetchFn: createEmptySearchFetch(),
    });

    await expect(
      adapter.loadDocuments(
        {
          resources: [],
        },
        {
          credential: {
            accessToken: 'notion-access-token',
          },
        },
      ),
    ).rejects.toMatchObject({
      code: 'notion-no-readable-pages',
      message: 'No readable Notion pages were shared with this connection.',
      status: 404,
    } satisfies Partial<SourceAdapterError>);
  });

  it('returns a safe resource error when a selected page is no longer shared', async () => {
    const adapter = createNotionSourceAdapter({
      fetchFn: createStatusFetch(404),
    });

    await expect(
      adapter.loadDocuments(
        {
          resources: [
            {
              externalId: 'b55c9c91-384d-452b-81db-d1ef79372b75',
              title: 'Notion Roadmap',
              type: 'page',
            },
          ],
        },
        {
          credential: {
            accessToken: 'notion-access-token',
          },
        },
      ),
    ).rejects.toMatchObject({
      code: 'notion-resource-not-found',
      message:
        'A selected Notion resource was not found or is no longer shared with this connection.',
      status: 404,
    } satisfies Partial<SourceAdapterError>);
  });

  it('returns a safe provider error without leaking the Notion response body', async () => {
    const adapter = createNotionSourceAdapter({
      fetchFn: createStatusFetch(500),
    });

    await expect(
      adapter.listResources?.({
        credential: {
          accessToken: 'notion-access-token',
        },
      }),
    ).rejects.toMatchObject({
      code: 'notion-fetch-failed',
      message: 'Notion content could not be loaded. Check the connection and try again.',
      status: 502,
    } satisfies Partial<SourceAdapterError>);
  });
});
