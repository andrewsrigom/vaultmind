import { getWorkspaceDoc, updateWorkspaceDoc } from '@/db/queries/workspace-docs';
import { parseJsonRequestBody, parseRouteParams } from '@/lib/api/request';
import { toEmbeddingProviderApiError } from '@/lib/api/provider-errors';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import {
  requireVaultDocsManagementForRequest,
  requireVaultDocsReadForRequest,
} from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { RagIngestionError } from '@/lib/rag/ingest-documents';
import {
  indexWorkspaceDocForAskAi,
  WorkspaceDocAskAiIndexingError,
} from '@/lib/rag/index-workspace-doc';
import {
  vaultWorkspaceDocDetailRouteParamsSchema,
  updateWorkspaceDocRequestSchema,
} from '@/lib/validators/workspace-doc';
import { EmbeddingProviderError } from '@/lib/providers/embedding-provider';

import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';
import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-doc-api');

export async function GET(
  request: NextRequest,
  context: RouteContext<VaultWorkspaceDocDetailRouteParams>,
) {
  const params = await parseRouteParams(context, vaultWorkspaceDocDetailRouteParamsSchema);

  if (!params) {
    return apiError('invalid-input', 'Vault ID and doc ID must be UUIDs.', 400);
  }

  const access = await requireVaultDocsReadForRequest({
    request,
    vaultId: params.vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  try {
    const doc = await getWorkspaceDoc({
      docId: params.docId,
      includeArchived: true,
      vaultId: params.vaultId,
    });

    if (!doc) {
      return apiError('not-found', 'Doc was not found.', 404);
    }

    return apiSuccess({ doc });
  } catch (error: unknown) {
    logger.error('Failed to read workspace doc.', error, params);

    return apiUnexpectedError('Could not read doc.');
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<VaultWorkspaceDocDetailRouteParams>,
) {
  const params = await parseRouteParams(context, vaultWorkspaceDocDetailRouteParamsSchema);

  if (!params) {
    return apiError('invalid-input', 'Vault ID and doc ID must be UUIDs.', 400);
  }

  const access = await requireVaultDocsManagementForRequest({
    request,
    vaultId: params.vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, updateWorkspaceDocRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const doc = await updateWorkspaceDoc({
      content: parsedBody.data.content,
      docId: params.docId,
      title: parsedBody.data.title,
      vaultId: params.vaultId,
    });

    if (!doc) {
      return apiError('not-found', 'Doc was not found.', 404);
    }

    if (doc.includeInAskAi) {
      await indexWorkspaceDocForAskAi({
        docId: doc.id,
        vaultId: params.vaultId,
      });
    }

    return apiSuccess({ doc });
  } catch (error: unknown) {
    if (error instanceof WorkspaceDocAskAiIndexingError) {
      const status = error.code === 'source-not-configured' ? 409 : 500;

      return apiError(error.code, error.message, status);
    }

    if (error instanceof RagIngestionError) {
      return apiError(error.code, error.message, 500);
    }

    if (error instanceof EmbeddingProviderError) {
      return toEmbeddingProviderApiError(error);
    }

    logger.error('Failed to update workspace doc.', error, params);

    return apiUnexpectedError('Could not update doc.');
  }
}
