import { z } from 'zod';

import {
  branchSchema,
  githubRepoUrlSchema,
  optionalPathFiltersSchema,
} from '@/lib/validators/source';

const descriptionSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

const nameSchema = z.string().trim().min(1).max(120);
const optionalVaultIdSchema = z.string().uuid().optional();

const createGitHubWorkspaceIndexSchema = z
  .object({
    branch: branchSchema,
    description: descriptionSchema,
    excludePaths: optionalPathFiltersSchema,
    includePaths: optionalPathFiltersSchema,
    name: nameSchema,
    repoUrl: githubRepoUrlSchema,
    sourceType: z.literal('github').optional().default('github'),
    vaultId: optionalVaultIdSchema,
  })
  .strict();

export const createWorkspaceIndexSchema = createGitHubWorkspaceIndexSchema;

export const workspaceIndexRouteParamsSchema = z.object({
  workspaceIndexId: z.string().uuid(),
});

export const workspaceIndexSourceRouteParamsSchema = z.object({
  sourceId: z.string().uuid(),
  workspaceIndexId: z.string().uuid(),
});

export const updateWorkspaceIndexSchema = z
  .object({
    description: descriptionSchema,
    name: nameSchema,
  })
  .strict();

export type CreateWorkspaceIndexInput = z.infer<typeof createWorkspaceIndexSchema>;
export type WorkspaceIndexRouteParams = z.infer<typeof workspaceIndexRouteParamsSchema>;
export type WorkspaceIndexSourceRouteParams = z.infer<typeof workspaceIndexSourceRouteParamsSchema>;
export type UpdateWorkspaceIndexInput = z.infer<typeof updateWorkspaceIndexSchema>;

export function getZodErrorMessage(error: z.ZodError): string {
  const [issue] = error.issues;

  return issue?.message ?? 'Invalid input.';
}
