import { z } from 'zod';

import { workspaceDocStatuses } from '@/db/schema';

import type { JsonValue } from '@/db/schema';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.null(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const creatableWorkspaceDocTypes = ['note', 'article', 'guide'] as const;

export const vaultWorkspaceDocRouteParamsSchema = z.object({
  vaultId: z.uuid(),
});

export const vaultWorkspaceDocDetailRouteParamsSchema = z.object({
  docId: z.uuid(),
  vaultId: z.uuid(),
});

export const createWorkspaceDocRequestSchema = z.object({
  content: z.string().optional(),
  docType: z.enum(creatableWorkspaceDocTypes).optional(),
  metadata: jsonValueSchema.optional(),
  parentDocId: z.uuid().nullable().optional(),
  status: z.enum(workspaceDocStatuses).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  title: z.string().trim().min(1, 'Title is required.').max(120),
  workspaceAreaId: z.uuid(),
});

export const updateWorkspaceDocRequestSchema = z.object({
  content: z.string(),
  title: z.string().trim().min(1, 'Title is required.').max(120),
});

export const askAiWorkspaceDocRequestSchema = z.object({
  includeInAskAi: z.boolean(),
});

export const favoriteWorkspaceDocRequestSchema = z.object({
  isFavorite: z.boolean(),
});

export const moveWorkspaceDocRequestSchema = z.object({
  parentDocId: z.uuid().nullable(),
  workspaceAreaId: z.uuid(),
});

export type CreateWorkspaceDocRequestInput = z.infer<typeof createWorkspaceDocRequestSchema>;
export type AskAiWorkspaceDocRequestInput = z.infer<typeof askAiWorkspaceDocRequestSchema>;
export type FavoriteWorkspaceDocRequestInput = z.infer<typeof favoriteWorkspaceDocRequestSchema>;
export type MoveWorkspaceDocRequestInput = z.infer<typeof moveWorkspaceDocRequestSchema>;
export type VaultWorkspaceDocDetailRouteParams = z.infer<
  typeof vaultWorkspaceDocDetailRouteParamsSchema
>;
export type VaultWorkspaceDocRouteParams = z.infer<typeof vaultWorkspaceDocRouteParamsSchema>;
export type UpdateWorkspaceDocRequestInput = z.infer<typeof updateWorkspaceDocRequestSchema>;
