import {
  createWorkspaceIndexWithGitHubSource,
  listWorkspaceIndexes,
} from '@/db/queries/workspace-indexes';
import { defaultVaultId } from '@/db/schema';
import { parseOptionalUuidSearchParam, readJsonBody } from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import {
  requireVaultAccessForRequest,
  requireVaultSourceManagementForRequest,
} from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { GitHubRepoUrlError, parseGitHubRepoUrl } from '@/lib/sources/github/parse-github-url';
import { createWorkspaceIndexSchema, getZodErrorMessage } from '@/lib/validators/workspace-index';

import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-indexes-api');

export async function GET(request: NextRequest) {
  const vaultId = parseOptionalUuidSearchParam(request, 'vaultId');

  if (!vaultId.ok) {
    return apiError('invalid-input', 'Invalid vault ID.', 400);
  }

  if (!vaultId.value) {
    return apiError('invalid-input', 'Vault ID is required.', 400);
  }

  const access = await requireVaultAccessForRequest({
    request,
    vaultId: vaultId.value,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const workspaceIndexes = await listWorkspaceIndexes({ vaultId: vaultId.value });

    return apiSuccess({ workspaceIndexes });
  } catch (error: unknown) {
    logger.error('Failed to list workspace indexes.', error);

    return apiDatabaseError('Could not load workspace indexes.');
  }
}

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  const parsedBody = createWorkspaceIndexSchema.safeParse(body);

  if (!parsedBody.success) {
    return apiError('invalid-input', getZodErrorMessage(parsedBody.error), 400);
  }

  const vaultId = parsedBody.data.vaultId ?? defaultVaultId;
  const access = await requireVaultSourceManagementForRequest({
    request,
    vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const parsedRepo = parseGitHubRepoUrl(parsedBody.data.repoUrl);
    const result = await createWorkspaceIndexWithGitHubSource({
      branch: parsedBody.data.branch,
      description: parsedBody.data.description,
      excludePaths: parsedBody.data.excludePaths,
      includePaths: parsedBody.data.includePaths,
      name: parsedBody.data.name,
      parsedRepo,
      vaultId,
    });

    return apiSuccess(result, 201);
  } catch (error: unknown) {
    if (error instanceof GitHubRepoUrlError) {
      return apiError(error.code, error.message, 400);
    }

    logger.error('Failed to create workspace index.', error);

    return apiDatabaseError('Could not create the workspace index.');
  }
}
