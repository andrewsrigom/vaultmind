import { z } from 'zod';

import { areaSuggestionStatuses } from '@/db/schema';

export const workspaceIndexAreaDiscoveryRouteParamsSchema = z.object({
  areaDiscoveryRunId: z.string().uuid(),
  workspaceIndexId: z.string().uuid(),
});

export const workspaceIndexAreaSuggestionRouteParamsSchema = z.object({
  areaSuggestionId: z.string().uuid(),
  workspaceIndexId: z.string().uuid(),
});

export const updateAreaSuggestionStatusSchema = z
  .object({
    status: z.enum(areaSuggestionStatuses),
  })
  .strict();

export type WorkspaceIndexAreaDiscoveryRouteParams = z.infer<
  typeof workspaceIndexAreaDiscoveryRouteParamsSchema
>;
export type WorkspaceIndexAreaSuggestionRouteParams = z.infer<
  typeof workspaceIndexAreaSuggestionRouteParamsSchema
>;
export type UpdateAreaSuggestionStatusInput = z.infer<typeof updateAreaSuggestionStatusSchema>;
