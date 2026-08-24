import { z } from 'zod';

export const vaultRouteParamsSchema = z.object({
  vaultId: z.uuid(),
});

export type VaultRouteParams = z.infer<typeof vaultRouteParamsSchema>;
