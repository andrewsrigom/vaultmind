import { z } from 'zod';

export const branchSchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.string().trim().min(1).max(120).default('main'));

export const githubRepoUrlSchema = z
  .string()
  .trim()
  .url('Use a valid GitHub.com repository URL.')
  .max(300);

const maxPathFilters = 50;
const maxPathFilterLength = 240;

export function normalizePathFilter(input: string): string | null {
  const normalized = input
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  return normalized.length > 0 ? normalized : null;
}

export function parsePathFilterText(input: string): string[] {
  const filters = input
    .split(/\r?\n|,/)
    .map((value) => normalizePathFilter(value))
    .filter((value): value is string => value !== null);

  return Array.from(new Set(filters));
}

function hasRelativePathSegment(input: string): boolean {
  return input.split('/').some((segment) => segment === '.' || segment === '..');
}

const pathFilterSchema = z.string().transform((value, context) => {
  const normalized = normalizePathFilter(value);

  if (!normalized) {
    context.addIssue({
      code: 'custom',
      message: 'Path filters must not be empty.',
    });
    return z.NEVER;
  }

  if (normalized.length > maxPathFilterLength) {
    context.addIssue({
      code: 'custom',
      message: `Path filters must be ${maxPathFilterLength} characters or fewer.`,
    });
    return z.NEVER;
  }

  if (hasRelativePathSegment(normalized)) {
    context.addIssue({
      code: 'custom',
      message: 'Path filters must be repository-relative path prefixes.',
    });
    return z.NEVER;
  }

  return normalized;
});

export const pathFiltersSchema = z
  .array(pathFilterSchema)
  .max(maxPathFilters, `Use at most ${maxPathFilters} path filters.`)
  .transform((values) => Array.from(new Set(values)));

export const optionalPathFiltersSchema = pathFiltersSchema.optional().default([]);

export const githubSourceConfigSchema = z
  .object({
    branch: branchSchema,
    excludePaths: optionalPathFiltersSchema,
    includePaths: optionalPathFiltersSchema,
    owner: z.string().trim().min(1).max(39),
    repo: z.string().trim().min(1).max(100),
    repoUrl: githubRepoUrlSchema,
  })
  .strict();

export const notionSourceResourceTypeSchema = z.enum(['data-source', 'database', 'page']);

export const notionSourceResourceSchema = z
  .object({
    externalId: z.string().trim().min(1).max(120),
    lastEditedTime: z.string().trim().datetime({ offset: true }).optional(),
    title: z.string().trim().min(1).max(240),
    type: notionSourceResourceTypeSchema,
    url: z.string().trim().url().max(500).optional(),
  })
  .strict();

export const notionSourceConfigSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    resources: z
      .array(notionSourceResourceSchema)
      .max(500, 'Use at most 500 Notion resources per source.')
      .transform((resources) => {
        const resourceByExternalId = new Map(
          resources.map((resource) => [resource.externalId, resource]),
        );

        return [...resourceByExternalId.values()];
      }),
    workspaceId: z.string().trim().min(1).max(120).optional(),
    workspaceName: z.string().trim().min(1).max(240).optional(),
  })
  .strict();

export const googleDriveSourceResourceTypeSchema = z.enum(['document', 'file', 'folder']);

export const googleDriveSourceResourceSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    mimeType: z.string().trim().min(1).max(200),
    modifiedTime: z.string().trim().datetime({ offset: true }).optional(),
    title: z.string().trim().min(1).max(240),
    type: googleDriveSourceResourceTypeSchema,
    url: z.string().trim().url().max(500).optional(),
  })
  .strict();

export const googleDriveSourceConfigSchema = z
  .object({
    resources: z
      .array(googleDriveSourceResourceSchema)
      .max(500, 'Use at most 500 Google Drive resources per source.')
      .transform((resources) => {
        const resourceByExternalId = new Map(
          resources.map((resource) => [resource.externalId, resource]),
        );

        return [...resourceByExternalId.values()];
      }),
  })
  .strict();

export const updateSourceFiltersSchema = z
  .object({
    excludePaths: optionalPathFiltersSchema,
    includePaths: optionalPathFiltersSchema,
  })
  .strict();

const createGitHubSourceSchema = z
  .object({
    branch: branchSchema,
    excludePaths: optionalPathFiltersSchema,
    includePaths: optionalPathFiltersSchema,
    repoUrl: githubRepoUrlSchema,
    sourceType: z.literal('github').optional().default('github'),
  })
  .strict();

const createNotionSourceSchema = z
  .object({
    resources: z.array(notionSourceResourceSchema).max(500).default([]),
    sourceType: z.literal('notion'),
    workspaceId: z.string().trim().min(1).max(120).optional(),
    workspaceName: z.string().trim().min(1).max(240).optional(),
  })
  .strict();

const createGoogleDriveSourceSchema = z
  .object({
    resources: z.array(googleDriveSourceResourceSchema).max(500).default([]),
    sourceType: z.literal('google-drive'),
  })
  .strict();

const createWorkspaceSourcePayloadSchema = z.discriminatedUnion('sourceType', [
  createGitHubSourceSchema.extend({ sourceType: z.literal('github') }),
  createGoogleDriveSourceSchema,
  createNotionSourceSchema,
]);

export const createWorkspaceSourceSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || 'sourceType' in value) {
    return value;
  }

  return {
    ...value,
    sourceType: 'github',
  };
}, createWorkspaceSourcePayloadSchema);

export type CreateWorkspaceSourceInput = z.infer<typeof createWorkspaceSourceSchema>;
