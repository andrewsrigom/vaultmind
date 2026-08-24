import { afterEach, describe, expect, it, vi } from 'vitest';

import { exchangeNotionOAuthCode, listSharedNotionPages } from '@/lib/sources/notion/notion-api';

import type { NotionFetch } from '@/lib/sources/notion/notion-api';

describe('notion-api request timeouts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes abort signals to API and OAuth requests', async () => {
    const capturedSignals: AbortSignal[] = [];
    const fetchFn: NotionFetch = async (input, init) => {
      if (init?.signal) {
        capturedSignals.push(init.signal);
      }

      if (input.toString().endsWith('/oauth/token')) {
        return Response.json({
          access_token: 'notion-token',
          bot_id: 'bot-123',
          refresh_token: null,
          workspace_id: 'workspace-123',
          workspace_name: 'Acme',
        });
      }

      return Response.json({
        has_more: false,
        next_cursor: null,
        results: [],
      });
    };

    await listSharedNotionPages({
      accessToken: 'notion-token',
      fetchFn,
      timeoutMs: 50,
    });
    await exchangeNotionOAuthCode({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      code: 'oauth-code',
      fetchFn,
      redirectUri: 'https://app.example.com/callback',
      timeoutMs: 50,
    });

    expect(capturedSignals).toHaveLength(2);
    expect(capturedSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it('maps an aborted request to the safe provider error', async () => {
    vi.useFakeTimers();

    const fetchFn: NotionFetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Request timed out.', 'AbortError'));
        });
      });
    const request = expect(
      listSharedNotionPages({
        accessToken: 'notion-token',
        fetchFn,
        timeoutMs: 25,
      }),
    ).rejects.toMatchObject({
      code: 'notion-fetch-failed',
      status: 502,
    });

    await vi.advanceTimersByTimeAsync(25);
    await request;
  });
});
