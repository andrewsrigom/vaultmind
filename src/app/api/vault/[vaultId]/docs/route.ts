import { createWorkspaceDoc } from '@/db/queries/workspace-docs';
import { parseJsonRequestBody, parseRouteParams } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireVaultDocsCreationForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import {
  createWorkspaceDocRequestSchema,
  vaultWorkspaceDocRouteParamsSchema,
} from '@/lib/validators/workspace-doc';

import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocRouteParams } from '@/lib/validators/workspace-doc';
import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-docs-api');

export async function POST(
  request: NextRequest,
  context: RouteContext<VaultWorkspaceDocRouteParams>,
) {
  const params = await parseRouteParams(context, vaultWorkspaceDocRouteParamsSchema);

  if (!params) {
    return apiError('invalid-input', 'Vault ID must be a UUID.', 400);
  }

  const access = await requireVaultDocsCreationForRequest({
    request,
    vaultId: params.vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, createWorkspaceDocRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const doc = await createWorkspaceDoc({
      ...(parsedBody.data.content !== undefined ? { content: parsedBody.data.content } : {}),
      ...(parsedBody.data.docType ? { docType: parsedBody.data.docType } : {}),
      ...(parsedBody.data.metadata !== undefined ? { metadata: parsedBody.data.metadata } : {}),
      parentDocId: parsedBody.data.parentDocId ?? null,
      vaultId: params.vaultId,
      ...(parsedBody.data.status ? { status: parsedBody.data.status } : {}),
      ...(parsedBody.data.tags ? { tags: parsedBody.data.tags } : {}),
      title: parsedBody.data.title,
      workspaceAreaId: parsedBody.data.workspaceAreaId,
    });

    if (!doc) {
      return apiError('not-found', 'Space or parent doc was not found.', 404);
    }

    return apiSuccess({ doc }, 201);
  } catch (error: unknown) {
    logger.error('Failed to create workspace doc.', error, params);

    return apiUnexpectedError('Could not create doc.');
  }
}
