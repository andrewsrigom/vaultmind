import { Buffer } from 'node:buffer';

import { withAbortTimeout } from '@/lib/async';
import { SourceAdapterError } from '@/lib/sources/errors';

import type { SourceSelectableResource } from '@/lib/sources/types';

export type GoogleDriveFetch = typeof fetch;

export type GoogleDriveFileResource = SourceSelectableResource & {
  mimeType: string;
  modifiedTime?: string;
  type: 'document' | 'file' | 'folder';
};

export type GoogleDriveOAuthToken = {
  accessToken: string;
  expiresAt: Date | null;
  refreshToken: string | null;
  scopes: string[];
};

const defaultFetch: GoogleDriveFetch = fetch;
const defaultGoogleDriveTimeoutMs = 20_000;
const googleDriveApiBaseUrl = 'https://www.googleapis.com/drive/v3';
const googleOAuthTokenUrl = 'https://oauth2.googleapis.com/token';

export const googleDocsMimeType = 'application/vnd.google-apps.document';
export const googleDriveFolderMimeType = 'application/vnd.google-apps.folder';
export const googleDriveMarkdownExportMimeType = 'text/markdown';
export const googleDriveReadOnlyScope = 'https://www.googleapis.com/auth/drive.readonly';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, key: string): string | null {
  if (!isObject(value)) {
    return null;
  }

  const propertyValue = value[key];

  return typeof propertyValue === 'string' && propertyValue.trim().length > 0
    ? propertyValue
    : null;
}

function readOptionalString(value: unknown, key: string): string | null {
  if (!isObject(value)) {
    return null;
  }

  const propertyValue = value[key];

  return typeof propertyValue === 'string' ? propertyValue : null;
}

function getGoogleDriveError(status: number): SourceAdapterError {
  if (status === 401 || status === 403) {
    return new SourceAdapterError(
      'google-drive-unauthorized',
      'Google Drive rejected this connection. Reconnect Google Drive and try again.',
      status,
    );
  }

  if (status === 404) {
    return new SourceAdapterError(
      'google-drive-resource-not-found',
      'A selected Google Drive file was not found or is no longer shared with this connection.',
      404,
    );
  }

  if (status === 429) {
    return new SourceAdapterError(
      'google-drive-rate-limited',
      'Google Drive rate limited this sync. Wait a moment and try again.',
      429,
    );
  }

  return new SourceAdapterError(
    'google-drive-fetch-failed',
    'Google Drive content could not be loaded. Check the connection and try again.',
    status >= 500 ? 502 : 400,
  );
}

async function googleDriveFetchJson(input: {
  accessToken: string;
  fetchFn?: GoogleDriveFetch;
  pathname: string;
  searchParams?: Record<string, string>;
  timeoutMs?: number;
}): Promise<unknown> {
  const fetchFn = input.fetchFn ?? defaultFetch;
  const url = new URL(`${googleDriveApiBaseUrl}${input.pathname}`);

  for (const [key, value] of Object.entries(input.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;

  try {
    response = await withAbortTimeout(
      (signal) =>
        fetchFn(url, {
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
          },
          signal,
        }),
      input.timeoutMs ?? defaultGoogleDriveTimeoutMs,
    );
  } catch {
    throw getGoogleDriveError(500);
  }

  if (!response.ok) {
    throw getGoogleDriveError(response.status);
  }

  return response.json();
}

function getPaginatedFiles(payload: unknown): {
  files: unknown[];
  nextPageToken: string | null;
} {
  if (!isObject(payload)) {
    throw new SourceAdapterError(
      'google-drive-fetch-failed',
      'Google Drive returned an unexpected response.',
      502,
    );
  }

  const files = payload.files;

  if (!Array.isArray(files)) {
    throw new SourceAdapterError(
      'google-drive-fetch-failed',
      'Google Drive returned an unexpected response.',
      502,
    );
  }

  return {
    files,
    nextPageToken: readString(payload, 'nextPageToken'),
  };
}

function toGoogleDriveFileResource(value: unknown): GoogleDriveFileResource | null {
  if (!isObject(value)) {
    return null;
  }

  const id = readString(value, 'id');
  const name = readString(value, 'name');
  const mimeType = readString(value, 'mimeType');

  if (!id || !name || !mimeType) {
    return null;
  }

  const webViewLink = readString(value, 'webViewLink');
  const modifiedTime = readString(value, 'modifiedTime');
  const type =
    mimeType === googleDriveFolderMimeType
      ? 'folder'
      : mimeType === googleDocsMimeType
        ? 'document'
        : 'file';

  return {
    externalId: id,
    mimeType,
    title: name,
    type,
    ...(modifiedTime ? { lastEditedTime: modifiedTime, modifiedTime } : {}),
    ...(webViewLink ? { url: webViewLink } : {}),
  };
}

export async function listReadableGoogleDocs(input: {
  accessToken: string;
  fetchFn?: GoogleDriveFetch;
  maxFiles?: number;
  timeoutMs?: number;
}): Promise<GoogleDriveFileResource[]> {
  const maxFiles = input.maxFiles ?? 500;
  const resources: GoogleDriveFileResource[] = [];
  let nextPageToken: string | null = null;

  do {
    const payload = await googleDriveFetchJson({
      accessToken: input.accessToken,
      ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
      pathname: '/files',
      searchParams: {
        fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)',
        includeItemsFromAllDrives: 'true',
        orderBy: 'modifiedTime desc',
        pageSize: String(Math.min(100, maxFiles - resources.length)),
        q: `mimeType='${googleDocsMimeType}' and trashed=false`,
        supportsAllDrives: 'true',
        ...(nextPageToken ? { pageToken: nextPageToken } : {}),
      },
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    });
    const page = getPaginatedFiles(payload);

    resources.push(
      ...page.files.flatMap((file) => {
        const resource = toGoogleDriveFileResource(file);

        return resource ? [resource] : [];
      }),
    );

    nextPageToken = page.nextPageToken && resources.length < maxFiles ? page.nextPageToken : null;
  } while (nextPageToken);

  return resources;
}

export async function exportGoogleDocAsMarkdown(input: {
  accessToken: string;
  fetchFn?: GoogleDriveFetch;
  fileId: string;
  timeoutMs?: number;
}): Promise<string> {
  const fetchFn = input.fetchFn ?? defaultFetch;
  const url = new URL(`${googleDriveApiBaseUrl}/files/${input.fileId}/export`);

  url.searchParams.set('mimeType', googleDriveMarkdownExportMimeType);

  let response: Response;

  try {
    response = await withAbortTimeout(
      (signal) =>
        fetchFn(url, {
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
          },
          signal,
        }),
      input.timeoutMs ?? defaultGoogleDriveTimeoutMs,
    );
  } catch {
    throw getGoogleDriveError(500);
  }

  if (!response.ok) {
    throw getGoogleDriveError(response.status);
  }

  return response.text();
}

export async function exchangeGoogleDriveOAuthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  fetchFn?: GoogleDriveFetch;
  redirectUri: string;
  timeoutMs?: number;
}): Promise<GoogleDriveOAuthToken> {
  const fetchFn = input.fetchFn ?? defaultFetch;
  const credentials = Buffer.from(`${input.clientId}:${input.clientSecret}`, 'utf8').toString(
    'base64',
  );
  let response: Response;

  try {
    response = await withAbortTimeout(
      (signal) =>
        fetchFn(googleOAuthTokenUrl, {
          body: JSON.stringify({
            code: input.code,
            grant_type: 'authorization_code',
            redirect_uri: input.redirectUri,
          }),
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal,
        }),
      input.timeoutMs ?? defaultGoogleDriveTimeoutMs,
    );
  } catch {
    throw getGoogleDriveError(500);
  }

  if (!response.ok) {
    throw getGoogleDriveError(response.status);
  }

  const payload = await response.json();

  if (!isObject(payload)) {
    throw new SourceAdapterError(
      'google-drive-fetch-failed',
      'Google returned an unexpected OAuth response.',
      502,
    );
  }

  const accessToken = readString(payload, 'access_token');

  if (!accessToken) {
    throw new SourceAdapterError(
      'google-drive-fetch-failed',
      'Google returned an unexpected OAuth response.',
      502,
    );
  }

  const expiresIn = Number(payload.expires_in);

  return {
    accessToken,
    expiresAt: Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000) : null,
    refreshToken: readOptionalString(payload, 'refresh_token'),
    scopes: (readOptionalString(payload, 'scope') ?? '')
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}
