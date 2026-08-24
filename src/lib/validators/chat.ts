import { z } from 'zod';

export const chatRequestSchema = z
  .object({
    areaId: z.uuid().optional(),
    chatSessionId: z.uuid().optional(),
    message: z.string().trim().min(1).max(4_000),
    stream: z.boolean().optional(),
  })
  .strict();

export const chatSessionRouteParamsSchema = z.object({
  chatSessionId: z.uuid(),
});

export const updateChatSessionSchema = z
  .object({
    isPinned: z.boolean().optional(),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((input) => input.isPinned !== undefined || input.title !== undefined, {
    message: 'Provide a title or pinned state.',
  });

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export type ChatSessionRouteParams = z.infer<typeof chatSessionRouteParamsSchema>;
export type UpdateChatSessionInput = z.infer<typeof updateChatSessionSchema>;
