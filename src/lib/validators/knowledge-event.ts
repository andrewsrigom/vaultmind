import { trustSignalTypes } from '@/db/schema';
import { z } from 'zod';

export const trustSignalRequestSchema = z.object({
  chatMessageId: z.uuid(),
  signal: z.enum(trustSignalTypes),
  workspaceAreaId: z.uuid().optional(),
});

export type TrustSignalRequestInput = z.infer<typeof trustSignalRequestSchema>;
