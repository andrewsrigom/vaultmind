import { z } from 'zod';

export const vaultSearchRouteParamsSchema = z.object({
  vaultId: z.uuid(),
});

export const vaultSearchQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
});

export type VaultSearchRouteParams = z.infer<typeof vaultSearchRouteParamsSchema>;
