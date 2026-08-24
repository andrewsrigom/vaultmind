import { articleStatuses } from '@/db/schema';
import { z } from 'zod';

export const articleQuerySchema = z.object({
  areaId: z.uuid().optional(),
  status: z.enum(articleStatuses).optional(),
});

export const articleRouteParamsSchema = z.object({
  articleId: z.uuid(),
  workspaceIndexId: z.uuid(),
});

export const promoteArticleRequestSchema = z.object({
  areaId: z.uuid().optional(),
  assistantMessageId: z.uuid(),
  status: z.enum(articleStatuses).default('draft'),
});

export const createArticleRequestSchema = z.object({
  areaId: z.uuid().optional(),
  content: z.string().trim().min(1, 'Content is required.'),
  question: z.string().trim().min(1, 'Title is required.'),
  status: z.enum(articleStatuses).default('draft'),
});

export const articlePostRequestSchema = z.union([
  promoteArticleRequestSchema,
  createArticleRequestSchema,
]);

export const updateArticleRequestSchema = z.object({
  content: z.string().trim().min(1, 'Content is required.'),
  question: z.string().trim().min(1, 'Title is required.'),
  status: z.enum(articleStatuses).optional(),
});

export type ArticleQueryInput = z.infer<typeof articleQuerySchema>;
export type ArticleRouteParamsInput = z.infer<typeof articleRouteParamsSchema>;
export type ArticlePostRequestInput = z.infer<typeof articlePostRequestSchema>;
export type CreateArticleRequestInput = z.infer<typeof createArticleRequestSchema>;
export type PromoteArticleRequestInput = z.infer<typeof promoteArticleRequestSchema>;
export type UpdateArticleRequestInput = z.infer<typeof updateArticleRequestSchema>;
