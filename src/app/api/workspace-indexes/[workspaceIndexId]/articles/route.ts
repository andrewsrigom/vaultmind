import {
  createArticle,
  listArticles,
  promoteAssistantMessageToArticle,
} from '@/db/queries/articles';
import { parseWorkspaceIndexIdParam, readJsonBody } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import {
  requireWorkspaceIndexDocsCreationForRequest,
  requireWorkspaceIndexDocsReadForRequest,
} from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { articlePostRequestSchema, articleQuerySchema } from '@/lib/validators/article';
import { getZodErrorMessage } from '@/lib/validators/workspace-index';

import type { WorkspaceIndexRouteContext } from '@/lib/api/request';
import type { NextRequest } from 'next/server';

const logger = createLogger('articles-api');

export async function GET(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireWorkspaceIndexDocsReadForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedQuery = articleQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  if (!parsedQuery.success) {
    return apiError('invalid-input', getZodErrorMessage(parsedQuery.error), 400);
  }

  try {
    const articles = await listArticles({
      status: parsedQuery.data.status ?? null,
      workspaceAreaId: parsedQuery.data.areaId ?? null,
      workspaceIndexId,
    });

    return apiSuccess({ articles });
  } catch (error: unknown) {
    logger.error('Failed to list articles.', error, { workspaceIndexId });

    return apiUnexpectedError('Could not list articles.');
  }
}

export async function POST(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireWorkspaceIndexDocsCreationForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  const body = await readJsonBody(request);
  const parsedBody = articlePostRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return apiError('invalid-input', getZodErrorMessage(parsedBody.error), 400);
  }

  try {
    if (!('assistantMessageId' in parsedBody.data)) {
      const article = await createArticle({
        content: parsedBody.data.content,
        question: parsedBody.data.question,
        status: parsedBody.data.status,
        workspaceAreaId: parsedBody.data.areaId ?? null,
        workspaceIndexId,
      });

      if (!article) {
        return apiError('not-found', 'Workspace index or area was not found.', 404);
      }

      return apiSuccess(
        {
          article,
          status: 'created',
        },
        201,
      );
    }

    const result = await promoteAssistantMessageToArticle({
      assistantMessageId: parsedBody.data.assistantMessageId,
      status: parsedBody.data.status,
      workspaceAreaId: parsedBody.data.areaId ?? null,
      workspaceIndexId,
    });

    if (result.status === 'not-created') {
      if (result.reason === 'message-not-assistant') {
        return apiError(
          'invalid-input',
          'Only assistant messages can be promoted to articles.',
          400,
        );
      }

      if (result.reason === 'question-not-found') {
        return apiError('invalid-input', 'Could not find the question for this answer.', 400);
      }

      if (result.reason === 'area-not-found') {
        return apiError('not-found', 'Area was not found for this vault.', 404);
      }

      if (result.reason === 'area-not-inferred') {
        return apiError(
          'invalid-input',
          'Could not determine an article area from this answer.',
          400,
        );
      }

      return apiError('not-found', 'Assistant message was not found for this scope.', 404);
    }

    return apiSuccess(
      {
        article: result.article,
        status: result.status,
      },
      result.status === 'created' ? 201 : 200,
    );
  } catch (error: unknown) {
    logger.error('Failed to create article.', error, { workspaceIndexId });

    return apiUnexpectedError('Could not create article.');
  }
}
