import path from 'node:path';

import { SourceAdapterError } from '@/lib/sources/errors';
import { hashContent } from '@/lib/sources/hash-content';
import { listSharedNotionPages, retrieveNotionPageMarkdown } from '@/lib/sources/notion/notion-api';
import { notionSourceConfigSchema } from '@/lib/validators/source';

import type { NotionFetch, NotionPageResource } from '@/lib/sources/notion/notion-api';
import type {
  SourceAdapter,
  SourceAdapterContext,
  SourceDocument,
  SourceSyncResult,
} from '@/lib/sources/types';
import type { z } from 'zod';

export type NotionSourceConfig = z.infer<typeof notionSourceConfigSchema>;

export type NotionSourceAdapterOptions = {
  fetchFn?: NotionFetch;
};

function requireCredential(context: SourceAdapterContext | undefined): string {
  const accessToken = context?.credential?.accessToken.trim();

  if (!accessToken) {
    throw new SourceAdapterError(
      'notion-not-connected',
      'Connect Notion before syncing this source.',
      401,
    );
  }

  return accessToken;
}

function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'untitled';
}

function getNotionExternalId(resource: NotionPageResource): string {
  return `notion:page:${resource.externalId}`;
}

function getNotionPath(resource: NotionPageResource): string {
  const idSuffix = resource.externalId.replace(/-/g, '').slice(0, 12);

  return path.posix.join('notion', `${slugifyTitle(resource.title)}-${idSuffix}.md`);
}

function ensureMarkdownTitle(title: string, markdown: string): string {
  if (markdown.trimStart().startsWith('# ')) {
    return markdown;
  }

  return `# ${title}\n\n${markdown}`.trimEnd();
}

function getLatestExternalVersion(resources: NotionPageResource[]): string | undefined {
  const latestEditedTime = resources
    .map((resource) => resource.lastEditedTime)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return latestEditedTime;
}

function normalizeNotionDocument(input: {
  markdown: string;
  resource: NotionPageResource;
  truncated: boolean;
  unknownBlockIds: string[];
}): SourceDocument {
  const content = ensureMarkdownTitle(input.resource.title, input.markdown);

  return {
    content,
    contentHash: hashContent(content),
    externalId: getNotionExternalId(input.resource),
    ...(input.resource.url ? { externalUrl: input.resource.url } : {}),
    metadata: {
      externalUrl: input.resource.url,
      lastEditedTime: input.resource.lastEditedTime,
      notionId: input.resource.externalId,
      sourceType: 'notion',
      truncated: input.truncated,
      unknownBlockIds: input.unknownBlockIds,
    },
    path: getNotionPath(input.resource),
    title: input.resource.title,
    ...(input.resource.lastEditedTime ? { updatedAt: input.resource.lastEditedTime } : {}),
  };
}

function getConfiguredPageResources(config: NotionSourceConfig): NotionPageResource[] {
  return config.resources.flatMap((resource) => {
    if (resource.type !== 'page') {
      return [];
    }

    return [
      {
        externalId: resource.externalId,
        title: resource.title,
        type: 'page',
        ...(resource.lastEditedTime ? { lastEditedTime: resource.lastEditedTime } : {}),
        ...(resource.url ? { url: resource.url } : {}),
      } satisfies NotionPageResource,
    ];
  });
}

export function createNotionSourceAdapter(options: NotionSourceAdapterOptions = {}): SourceAdapter {
  return {
    async listResources(context) {
      const accessToken = requireCredential(context);

      return listSharedNotionPages({
        accessToken,
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
      });
    },
    async loadDocuments(
      config: unknown,
      context?: SourceAdapterContext,
    ): Promise<SourceSyncResult> {
      const parsedConfig = notionSourceConfigSchema.safeParse(config);

      if (!parsedConfig.success) {
        throw new SourceAdapterError('invalid-input', 'Notion source config is invalid.', 400);
      }

      const accessToken = requireCredential(context);
      const resources = getConfiguredPageResources(parsedConfig.data);
      const pageResources =
        resources.length > 0
          ? resources
          : await listSharedNotionPages({
              accessToken,
              ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
            });

      if (pageResources.length === 0) {
        throw new SourceAdapterError(
          'notion-no-readable-pages',
          'No readable Notion pages were shared with this connection.',
          404,
        );
      }

      const documents = await Promise.all(
        pageResources.map(async (resource) => {
          const page = await retrieveNotionPageMarkdown({
            accessToken,
            ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
            pageId: resource.externalId,
          });

          return normalizeNotionDocument({
            markdown: page.markdown,
            resource,
            truncated: page.truncated,
            unknownBlockIds: page.unknownBlockIds,
          });
        }),
      );

      const externalVersion = getLatestExternalVersion(pageResources);

      return {
        documents,
        ...(externalVersion ? { externalVersion } : {}),
        metadata: {
          pageCount: documents.length,
          sourceType: 'notion',
          ...(parsedConfig.data.workspaceId ? { workspaceId: parsedConfig.data.workspaceId } : {}),
          ...(parsedConfig.data.workspaceName
            ? { workspaceName: parsedConfig.data.workspaceName }
            : {}),
        },
      };
    },
    type: 'notion',
  };
}
