import {
  addGoogleDriveSourceToWorkspaceIndex,
  addGitHubSourceToWorkspaceIndex,
  addNotionSourceToWorkspaceIndex,
  updatePrimarySourcePathFilters,
  updateSourcePathFilters,
} from '@/db/queries/workspace-indexes';
import {
  parseJsonRequestBody,
  parseOptionalUuidSearchParam,
  parseWorkspaceIndexIdParam,
} from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import { requireSourceManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { GitHubRepoUrlError, parseGitHubRepoUrl } from '@/lib/sources/github/parse-github-url';
import { createWorkspaceSourceSchema, updateSourceFiltersSchema } from '@/lib/validators/source';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const logger = createLogger('workspace-index-source-api');

export async function POST(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, createWorkspaceSourceSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const source =
      parsedBody.data.sourceType === 'google-drive'
        ? await addGoogleDriveSourceToWorkspaceIndex({
            resources: parsedBody.data.resources.map((resource) => ({
              externalId: resource.externalId,
              mimeType: resource.mimeType,
              title: resource.title,
              type: resource.type,
              ...(resource.modifiedTime ? { modifiedTime: resource.modifiedTime } : {}),
              ...(resource.url ? { url: resource.url } : {}),
            })),
            workspaceIndexId,
          })
        : parsedBody.data.sourceType === 'notion'
          ? await addNotionSourceToWorkspaceIndex({
              resources: parsedBody.data.resources.map((resource) => ({
                externalId: resource.externalId,
                title: resource.title,
                type: resource.type,
                ...(resource.lastEditedTime ? { lastEditedTime: resource.lastEditedTime } : {}),
                ...(resource.url ? { url: resource.url } : {}),
              })),
              ...(parsedBody.data.workspaceId ? { workspaceId: parsedBody.data.workspaceId } : {}),
              ...(parsedBody.data.workspaceName
                ? { workspaceName: parsedBody.data.workspaceName }
                : {}),
              workspaceIndexId,
            })
          : await addGitHubSourceToWorkspaceIndex({
              branch: parsedBody.data.branch,
              excludePaths: parsedBody.data.excludePaths,
              includePaths: parsedBody.data.includePaths,
              parsedRepo: parseGitHubRepoUrl(parsedBody.data.repoUrl),
              workspaceIndexId,
            });

    if (!source) {
      return apiError('not-found', 'Workspace index was not found.', 404);
    }

    return apiSuccess({ source }, 201);
  } catch (error: unknown) {
    if (error instanceof GitHubRepoUrlError) {
      return apiError(error.code, error.message, 400);
    }

    logger.error('Failed to create knowledge source.', error, { workspaceIndexId });

    return apiDatabaseError('Could not create the source.');
  }
}

export async function PATCH(request: NextRequest, context: WorkspaceIndexRouteContext) {
  const workspaceIndexId = await parseWorkspaceIndexIdParam(context);

  if (!workspaceIndexId) {
    return apiError('invalid-input', 'Workspace index ID must be a UUID.', 400);
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, updateSourceFiltersSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const sourceId = parseOptionalUuidSearchParam(request, 'sourceId');

  if (!sourceId.ok) {
    return apiError('invalid-input', 'Source ID must be a UUID.', 400);
  }

  try {
    const source = sourceId.value
      ? await updateSourcePathFilters(workspaceIndexId, sourceId.value, parsedBody.data)
      : await updatePrimarySourcePathFilters(workspaceIndexId, parsedBody.data);

    if (!source) {
      return apiError('not-found', 'Knowledge source was not found.', 404);
    }

    return apiSuccess({ source });
  } catch (error: unknown) {
    logger.error('Failed to update knowledge source.', error, { workspaceIndexId });

    return apiDatabaseError('Could not update the source.');
  }
}
