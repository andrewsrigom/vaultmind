import { deleteArticle, updateArticle } from '@/db/queries/articles';
import { parseArticleParams, readJsonBody } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireWorkspaceIndexDocsManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { updateArticleRequestSchema } from '@/lib/validators/article';
import { getZodErrorMessage } from '@/lib/validators/workspace-index';

import type { NextRequest } from 'next/server';
import type { ArticleRouteContext } from '@/lib/api/request';

const logger = createLogger('article-api');

export async function PATCH(request: NextRequest, context: ArticleRouteContext) {
  const params = await parseArticleParams(context);

  if (!params) {
    return apiError('invalid-input', 'Workspace index ID and article ID must be UUIDs.', 400);
  }

  const access = await requireWorkspaceIndexDocsManagementForRequest({
    request,
    workspaceIndexId: params.workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  const body = await readJsonBody(request);
  const parsedBody = updateArticleRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return apiError('invalid-input', getZodErrorMessage(parsedBody.error), 400);
  }

  try {
    const article = await updateArticle({
      articleId: params.articleId,
      content: parsedBody.data.content,
      question: parsedBody.data.question,
      workspaceIndexId: params.workspaceIndexId,
      ...(parsedBody.data.status ? { status: parsedBody.data.status } : {}),
    });

    if (!article) {
      return apiError('not-found', 'Article was not found for this scope.', 404);
    }

    return apiSuccess({ article });
  } catch (error: unknown) {
    logger.error('Failed to update article.', error, params);

    return apiUnexpectedError('Could not update article.');
  }
}

export async function DELETE(request: NextRequest, context: ArticleRouteContext) {
  const params = await parseArticleParams(context);

  if (!params) {
    return apiError('invalid-input', 'Workspace index ID and article ID must be UUIDs.', 400);
  }

  const access = await requireWorkspaceIndexDocsManagementForRequest({
    request,
    workspaceIndexId: params.workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const article = await deleteArticle({
      articleId: params.articleId,
      workspaceIndexId: params.workspaceIndexId,
    });

    if (!article) {
      return apiError('not-found', 'Article was not found for this scope.', 404);
    }

    return apiSuccess({ article });
  } catch (error: unknown) {
    logger.error('Failed to delete article.', error, params);

    return apiUnexpectedError('Could not delete article.');
  }
}
