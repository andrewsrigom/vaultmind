import { z } from 'zod';

export const syncRequestSchema = z
  .object({
    sourceId: z.string().uuid().optional(),
    stream: z.boolean().optional(),
  })
  .strict();

export type SyncRequestInput = z.infer<typeof syncRequestSchema>;
