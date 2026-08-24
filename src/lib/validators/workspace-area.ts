import { workspaceAreaIconNames } from '@/db/schema';
import { z } from 'zod';

export const workspaceAreaRouteParamsSchema = z.object({
  areaId: z.uuid(),
  vaultId: z.uuid(),
});

export const vaultWorkspaceAreaRouteParamsSchema = z.object({
  vaultId: z.uuid(),
});

export const createWorkspaceAreaRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(80),
});

export const updateWorkspaceAreaRequestSchema = z.object({
  description: z.string().trim().max(500).nullable(),
  icon: z.enum(workspaceAreaIconNames),
  name: z.string().trim().min(1, 'Name is required.').max(80),
});

export type CreateWorkspaceAreaRequestInput = z.infer<typeof createWorkspaceAreaRequestSchema>;
export type VaultWorkspaceAreaRouteParams = z.infer<typeof vaultWorkspaceAreaRouteParamsSchema>;
export type UpdateWorkspaceAreaRequestInput = z.infer<typeof updateWorkspaceAreaRequestSchema>;
export type WorkspaceAreaRouteParams = z.infer<typeof workspaceAreaRouteParamsSchema>;
