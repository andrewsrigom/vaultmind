import { describe, expect, it } from 'vitest';

import {
  exchangeGoogleDriveOAuthCode,
  exportGoogleDocAsMarkdown,
  listReadableGoogleDocs,
} from '@/lib/sources/google-drive/google-drive-api';

import type { GoogleDriveFetch } from '@/lib/sources/google-drive/google-drive-api';

describe('google-drive-api request timeouts', () => {
  it('passes abort signals to list, export, and OAuth requests', async () => {
    const capturedSignals: AbortSignal[] = [];
    const fetchFn: GoogleDriveFetch = async (input, init) => {
      const url = input.toString();

      if (init?.signal) {
        capturedSignals.push(init.signal);
      }

      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({
          access_token: 'google-token',
          expires_in: 3600,
          refresh_token: 'refresh-token',
          scope: 'https://www.googleapis.com/auth/drive.readonly',
        });
      }

      if (url.includes('/export?')) {
        return new Response('# Exported document');
      }

      return Response.json({
        files: [],
        nextPageToken: null,
      });
    };

    await listReadableGoogleDocs({
      accessToken: 'google-token',
      fetchFn,
      timeoutMs: 50,
    });
    await exportGoogleDocAsMarkdown({
      accessToken: 'google-token',
      fetchFn,
      fileId: 'file-123',
      timeoutMs: 50,
    });
    await exchangeGoogleDriveOAuthCode({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      code: 'oauth-code',
      fetchFn,
      redirectUri: 'https://app.example.com/callback',
      timeoutMs: 50,
    });

    expect(capturedSignals).toHaveLength(3);
    expect(capturedSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });
});
