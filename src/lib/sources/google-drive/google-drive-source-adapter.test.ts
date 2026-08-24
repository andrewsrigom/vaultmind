import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGoogleDriveSourceAdapter } from '@/lib/sources/google-drive/google-drive-source-adapter';

import type { SourceAdapterError } from '@/lib/sources/errors';
import type { GoogleDriveFetch } from '@/lib/sources/google-drive/google-drive-api';

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });
}

function createTextResponse(payload: string, status = 200): Response {
  return new Response(payload, {
    headers: {
      'Content-Type': 'text/markdown',
    },
    status,
  });
}

function createMockGoogleDriveFetch(): GoogleDriveFetch {
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      return createJsonResponse({
        files: [
          {
            id: '1abcDriveDoc',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-06-24T12:00:00.000Z',
            name: 'Support Runbook',
            webViewLink: 'https://docs.google.com/document/d/1abcDriveDoc/edit',
          },
        ],
        nextPageToken: null,
      });
    }

    if (url.startsWith('https://www.googleapis.com/drive/v3/files/1abcDriveDoc/export?')) {
      return createTextResponse('Escalate urgent support requests within one hour.');
    }

    return createJsonResponse({ message: 'not found' }, 404);
  };
}

function createPartialExportFailureFetch(): GoogleDriveFetch {
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (url.startsWith('https://www.googleapis.com/drive/v3/files/1abcDriveDoc/export?')) {
      return createTextResponse('Escalate urgent support requests within one hour.');
    }

    if (url.startsWith('https://www.googleapis.com/drive/v3/files/2deniedDriveDoc/export?')) {
      return createTextResponse('Forbidden', 403);
    }

    return createJsonResponse({ message: 'not found' }, 404);
  };
}

describe('createGoogleDriveSourceAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an OAuth credential before loading documents', async () => {
    const adapter = createGoogleDriveSourceAdapter();

    await expect(
      adapter.loadDocuments({
        resources: [],
      }),
    ).rejects.toMatchObject({
      code: 'google-drive-not-connected',
      status: 401,
    } satisfies Partial<SourceAdapterError>);
  });

  it('lists Google Docs and normalizes exported Markdown', async () => {
    const adapter = createGoogleDriveSourceAdapter({
      fetchFn: createMockGoogleDriveFetch(),
    });
    const context = {
      credential: {
        accessToken: 'google-drive-access-token',
      },
    };
    const resources = await adapter.listResources?.(context);

    expect(resources).toEqual([
      {
        externalId: '1abcDriveDoc',
        lastEditedTime: '2026-06-24T12:00:00.000Z',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-06-24T12:00:00.000Z',
        title: 'Support Runbook',
        type: 'document',
        url: 'https://docs.google.com/document/d/1abcDriveDoc/edit',
      },
    ]);

    const result = await adapter.loadDocuments(
      {
        resources: [],
      },
      context,
    );

    expect(result.externalVersion).toBe('2026-06-24T12:00:00.000Z');
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      content: '# Support Runbook\n\nEscalate urgent support requests within one hour.',
      externalId: 'google-drive:1abcDriveDoc',
      externalUrl: 'https://docs.google.com/document/d/1abcDriveDoc/edit',
      path: 'google-drive/support-runbook-1abcDriveDoc.md',
      title: 'Support Runbook',
      updatedAt: '2026-06-24T12:00:00.000Z',
    });
    expect(result.documents[0]?.contentHash).toHaveLength(64);
    expect(result.metadata).toMatchObject({
      documentCount: 1,
      sourceType: 'google-drive',
    });
  });

  it('skips documents that Google Drive lists but denies during export', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = createGoogleDriveSourceAdapter({
      fetchFn: createPartialExportFailureFetch(),
    });
    const context = {
      credential: {
        accessToken: 'google-drive-access-token',
      },
    };

    const result = await adapter.loadDocuments(
      {
        resources: [
          {
            externalId: '1abcDriveDoc',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-06-24T12:00:00.000Z',
            title: 'Support Runbook',
            type: 'document',
            url: 'https://docs.google.com/document/d/1abcDriveDoc/edit',
          },
          {
            externalId: '2deniedDriveDoc',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-06-25T12:00:00.000Z',
            title: 'Restricted Runbook',
            type: 'document',
            url: 'https://docs.google.com/document/d/2deniedDriveDoc/edit',
          },
        ],
      },
      context,
    );

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      externalId: 'google-drive:1abcDriveDoc',
      title: 'Support Runbook',
    });
    expect(result.metadata).toMatchObject({
      documentCount: 1,
      skippedExportCount: 1,
      sourceType: 'google-drive',
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
