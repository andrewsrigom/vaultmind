import path from 'node:path';

import { createLogger } from '@/lib/logger';
import { SourceAdapterError } from '@/lib/sources/errors';
import {
  exportGoogleDocAsMarkdown,
  googleDocsMimeType,
  listReadableGoogleDocs,
} from '@/lib/sources/google-drive/google-drive-api';
import { hashContent } from '@/lib/sources/hash-content';
import { googleDriveSourceConfigSchema } from '@/lib/validators/source';

import type {
  GoogleDriveFetch,
  GoogleDriveFileResource,
} from '@/lib/sources/google-drive/google-drive-api';
import type {
  SourceAdapter,
  SourceAdapterContext,
  SourceDocument,
  SourceSyncResult,
} from '@/lib/sources/types';
import type { z } from 'zod';

export type GoogleDriveSourceConfig = z.infer<typeof googleDriveSourceConfigSchema>;

export type GoogleDriveSourceAdapterOptions = {
  fetchFn?: GoogleDriveFetch;
};

const logger = createLogger('google-drive-source-adapter');

function requireCredential(context: SourceAdapterContext | undefined): string {
  const accessToken = context?.credential?.accessToken.trim();

  if (!accessToken) {
    throw new SourceAdapterError(
      'google-drive-not-connected',
      'Connect Google Drive before syncing this source.',
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

function getGoogleDriveExternalId(resource: GoogleDriveFileResource): string {
  return `google-drive:${resource.externalId}`;
}

function getGoogleDrivePath(resource: GoogleDriveFileResource): string {
  return path.posix.join(
    'google-drive',
    `${slugifyTitle(resource.title)}-${resource.externalId.slice(0, 12)}.md`,
  );
}

function ensureMarkdownTitle(title: string, markdown: string): string {
  if (markdown.trimStart().startsWith('# ')) {
    return markdown;
  }

  return `# ${title}\n\n${markdown}`.trimEnd();
}

function getLatestExternalVersion(resources: GoogleDriveFileResource[]): string | undefined {
  return resources
    .map((resource) => resource.modifiedTime)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function getConfiguredDocuments(config: GoogleDriveSourceConfig): GoogleDriveFileResource[] {
  return config.resources.flatMap((resource) => {
    if (resource.type !== 'document' || resource.mimeType !== googleDocsMimeType) {
      return [];
    }

    return [
      {
        externalId: resource.externalId,
        mimeType: resource.mimeType,
        title: resource.title,
        type: 'document',
        ...(resource.modifiedTime
          ? { lastEditedTime: resource.modifiedTime, modifiedTime: resource.modifiedTime }
          : {}),
        ...(resource.url ? { url: resource.url } : {}),
      } satisfies GoogleDriveFileResource,
    ];
  });
}

function normalizeGoogleDriveDocument(input: {
  markdown: string;
  resource: GoogleDriveFileResource;
}): SourceDocument {
  const content = ensureMarkdownTitle(input.resource.title, input.markdown);

  return {
    content,
    contentHash: hashContent(content),
    externalId: getGoogleDriveExternalId(input.resource),
    ...(input.resource.url ? { externalUrl: input.resource.url } : {}),
    metadata: {
      externalUrl: input.resource.url,
      googleDriveFileId: input.resource.externalId,
      mimeType: input.resource.mimeType,
      modifiedTime: input.resource.modifiedTime,
      sourceType: 'google-drive',
    },
    path: getGoogleDrivePath(input.resource),
    title: input.resource.title,
    ...(input.resource.modifiedTime ? { updatedAt: input.resource.modifiedTime } : {}),
  };
}

function isSkippableGoogleDriveExportError(error: unknown): error is SourceAdapterError {
  return error instanceof SourceAdapterError && error.code === 'google-drive-unauthorized';
}

async function loadExportableGoogleDriveDocuments(input: {
  accessToken: string;
  fetchFn?: GoogleDriveFetch;
  resources: GoogleDriveFileResource[];
}): Promise<{ documents: SourceDocument[]; skippedExportCount: number }> {
  const documents: SourceDocument[] = [];
  let skippedExportCount = 0;

  for (const resource of input.resources) {
    try {
      const markdown = await exportGoogleDocAsMarkdown({
        accessToken: input.accessToken,
        ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
        fileId: resource.externalId,
      });

      documents.push(
        normalizeGoogleDriveDocument({
          markdown,
          resource,
        }),
      );
    } catch (error: unknown) {
      if (!isSkippableGoogleDriveExportError(error)) {
        throw error;
      }

      skippedExportCount += 1;
      logger.warn('Google Drive denied export for a listed document. Skipping document.', {
        fileId: resource.externalId,
        mimeType: resource.mimeType,
        status: error.status,
        title: resource.title,
      });
    }
  }

  return {
    documents,
    skippedExportCount,
  };
}

export function createGoogleDriveSourceAdapter(
  options: GoogleDriveSourceAdapterOptions = {},
): SourceAdapter {
  return {
    async listResources(context) {
      const accessToken = requireCredential(context);

      return listReadableGoogleDocs({
        accessToken,
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
      });
    },
    async loadDocuments(
      config: unknown,
      context?: SourceAdapterContext,
    ): Promise<SourceSyncResult> {
      const parsedConfig = googleDriveSourceConfigSchema.safeParse(config);

      if (!parsedConfig.success) {
        throw new SourceAdapterError(
          'invalid-input',
          'Google Drive source config is invalid.',
          400,
        );
      }

      const accessToken = requireCredential(context);
      const configuredDocuments = getConfiguredDocuments(parsedConfig.data);
      const resources =
        configuredDocuments.length > 0
          ? configuredDocuments
          : await listReadableGoogleDocs({
              accessToken,
              ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
            });

      if (resources.length === 0) {
        throw new SourceAdapterError(
          'google-drive-no-readable-documents',
          'No readable Google Docs were shared with this connection.',
          404,
        );
      }

      const { documents, skippedExportCount } = await loadExportableGoogleDriveDocuments({
        accessToken,
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
        resources,
      });

      if (documents.length === 0 && skippedExportCount > 0) {
        throw new SourceAdapterError(
          'google-drive-unauthorized',
          'Google Drive listed documents but denied export for every selected Google Doc. Reconnect Google Drive with an account that can download those docs and try again.',
          403,
        );
      }

      const externalVersion = getLatestExternalVersion(resources);

      return {
        documents,
        ...(externalVersion ? { externalVersion } : {}),
        metadata: {
          documentCount: documents.length,
          skippedExportCount,
          sourceType: 'google-drive',
        },
      };
    },
    type: 'google-drive',
  };
}
