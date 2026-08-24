import { Buffer } from 'node:buffer';

import { withAbortTimeout } from '@/lib/async';
import { SourceAdapterError } from '@/lib/sources/errors';

import type { SourceSelectableResource } from '@/lib/sources/types';

export type NotionFetch = typeof fetch;

export type NotionPageResource = SourceSelectableResource & {
  lastEditedTime?: string;
  type: 'page';
};

export type NotionMarkdownPage = {
  id: string;
  markdown: string;
  truncated: boolean;
  unknownBlockIds: string[];
};

export type NotionOAuthToken = {
  accessToken: string;
  botId: string;
  refreshToken: string | null;
  workspaceId: string;
  workspaceName: string | null;
};

const defaultFetch: NotionFetch = fetch;
const defaultNotionTimeoutMs = 20_000;
const notionApiBaseUrl = 'https://api.notion.com/v1';
export const notionApiVersion = '2026-03-11';

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

function readBoolean(value: unknown, key: string): boolean | null {
  if (!isObject(value)) {
    return null;
  }

  const propertyValue = value[key];

  return typeof propertyValue === 'boolean' ? propertyValue : null;
}

function getNotionError(status: number): SourceAdapterError {
  if (status === 401 || status === 403) {
    return new SourceAdapterError(
      'notion-unauthorized',
      'Notion rejected this connection. Reconnect Notion and try again.',
      status,
    );
  }

  if (status === 404) {
    return new SourceAdapterError(
      'notion-resource-not-found',
      'A selected Notion resource was not found or is no longer shared with this connection.',
      404,
    );
  }

  if (status === 429) {
    return new SourceAdapterError(
      'notion-rate-limited',
      'Notion rate limited this sync. Wait a moment and try again.',
      429,
    );
  }

  return new SourceAdapterError(
    'notion-fetch-failed',
    'Notion content could not be loaded. Check the connection and try again.',
    status >= 500 ? 502 : 400,
  );
}

async function notionFetchJson(input: {
  accessToken: string;
  body?: unknown;
  fetchFn?: NotionFetch;
  method?: 'GET' | 'POST';
  pathname: string;
  timeoutMs?: number;
}): Promise<unknown> {
  const fetchFn = input.fetchFn ?? defaultFetch;
  let response: Response;

  try {
    response = await withAbortTimeout(
      (signal) =>
        fetchFn(`${notionApiBaseUrl}${input.pathname}`, {
          ...(input.body ? { body: JSON.stringify(input.body) } : {}),
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': notionApiVersion,
          },
          method: input.method ?? 'GET',
          signal,
        }),
      input.timeoutMs ?? defaultNotionTimeoutMs,
    );
  } catch {
    throw getNotionError(500);
  }

  if (!response.ok) {
    throw getNotionError(response.status);
  }

  return response.json();
}

function readPlainText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => readString(item, 'plain_text') ?? '')
    .join('')
    .trim();
}

function getPageTitle(page: Record<string, unknown>): string {
  const properties = page.properties;

  if (!isObject(properties)) {
    return 'Untitled Notion page';
  }

  for (const property of Object.values(properties)) {
    if (!isObject(property) || property.type !== 'title') {
      continue;
    }

    const title = readPlainText(property.title);

    if (title) {
      return title;
    }
  }

  return 'Untitled Notion page';
}

function normalizeNotionId(id: string): string {
  return id.replace(/-/g, '');
}

function toPageResource(value: unknown): NotionPageResource | null {
  if (!isObject(value) || value.object !== 'page') {
    return null;
  }

  const id = readString(value, 'id');

  if (!id) {
    return null;
  }

  const lastEditedTime = readString(value, 'last_edited_time');
  const url = readString(value, 'url');

  return {
    externalId: id,
    title: getPageTitle(value),
    type: 'page',
    ...(lastEditedTime ? { lastEditedTime } : {}),
    ...(url ? { url } : {}),
  };
}

function getPaginatedResults(payload: unknown): {
  hasMore: boolean;
  nextCursor: string | null;
  results: unknown[];
} {
  if (!isObject(payload)) {
    throw new SourceAdapterError(
      'notion-fetch-failed',
      'Notion returned an unexpected response.',
      502,
    );
  }

  const results = payload.results;

  if (!Array.isArray(results)) {
    throw new SourceAdapterError(
      'notion-fetch-failed',
      'Notion returned an unexpected response.',
      502,
    );
  }

  return {
    hasMore: readBoolean(payload, 'has_more') ?? false,
    nextCursor: readString(payload, 'next_cursor'),
    results,
  };
}

export async function listSharedNotionPages(input: {
  accessToken: string;
  fetchFn?: NotionFetch;
  maxPages?: number;
  timeoutMs?: number;
}): Promise<NotionPageResource[]> {
  const maxPages = input.maxPages ?? 500;
  const resources: NotionPageResource[] = [];
  let nextCursor: string | null = null;

  do {
    const payload = await notionFetchJson({
      accessToken: input.accessToken,
      body: {
        filter: {
          property: 'object',
          value: 'page',
        },
        page_size: Math.min(100, maxPages - resources.length),
        ...(nextCursor ? { start_cursor: nextCursor } : {}),
      },
      ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
      method: 'POST',
      pathname: '/search',
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    });
    const page = getPaginatedResults(payload);

    resources.push(
      ...page.results.flatMap((result) => {
        const resource = toPageResource(result);

        return resource ? [resource] : [];
      }),
    );

    nextCursor = page.hasMore && resources.length < maxPages ? page.nextCursor : null;
  } while (nextCursor);

  return resources;
}

export async function retrieveNotionPageMarkdown(input: {
  accessToken: string;
  fetchFn?: NotionFetch;
  pageId: string;
  timeoutMs?: number;
}): Promise<NotionMarkdownPage> {
  const payload = await notionFetchJson({
    accessToken: input.accessToken,
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    pathname: `/pages/${normalizeNotionId(input.pageId)}/markdown`,
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
  });

  if (!isObject(payload)) {
    throw new SourceAdapterError(
      'notion-fetch-failed',
      'Notion returned an unexpected markdown response.',
      502,
    );
  }

  const id = readString(payload, 'id');
  const markdown = readOptionalString(payload, 'markdown');
  const truncated = readBoolean(payload, 'truncated') ?? false;
  const unknownBlockIds = Array.isArray(payload.unknown_block_ids)
    ? payload.unknown_block_ids.filter((value): value is string => typeof value === 'string')
    : [];

  if (!id || markdown === null) {
    throw new SourceAdapterError(
      'notion-fetch-failed',
      'Notion returned an unexpected markdown response.',
      502,
    );
  }

  return {
    id,
    markdown,
    truncated,
    unknownBlockIds,
  };
}

export async function exchangeNotionOAuthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  fetchFn?: NotionFetch;
  redirectUri: string;
  timeoutMs?: number;
}): Promise<NotionOAuthToken> {
  const fetchFn = input.fetchFn ?? defaultFetch;
  const credentials = Buffer.from(`${input.clientId}:${input.clientSecret}`, 'utf8').toString(
    'base64',
  );
  let response: Response;

  try {
    response = await withAbortTimeout(
      (signal) =>
        fetchFn(`${notionApiBaseUrl}/oauth/token`, {
          body: JSON.stringify({
            code: input.code,
            grant_type: 'authorization_code',
            redirect_uri: input.redirectUri,
          }),
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'Notion-Version': notionApiVersion,
          },
          method: 'POST',
          signal,
        }),
      input.timeoutMs ?? defaultNotionTimeoutMs,
    );
  } catch {
    throw getNotionError(500);
  }

  if (!response.ok) {
    throw getNotionError(response.status);
  }

  const payload = await response.json();

  if (!isObject(payload)) {
    throw new SourceAdapterError(
      'notion-fetch-failed',
      'Notion returned an unexpected OAuth response.',
      502,
    );
  }

  const accessToken = readString(payload, 'access_token');
  const botId = readString(payload, 'bot_id');
  const workspaceId = readString(payload, 'workspace_id');

  if (!accessToken || !botId || !workspaceId) {
    throw new SourceAdapterError(
      'notion-fetch-failed',
      'Notion returned an unexpected OAuth response.',
      502,
    );
  }

  return {
    accessToken,
    botId,
    refreshToken: readOptionalString(payload, 'refresh_token'),
    workspaceId,
    workspaceName: readOptionalString(payload, 'workspace_name'),
  };
}
