import { publishWorkspaceDoc, unpublishWorkspaceDoc } from '@/db/queries/workspace-docs';
import { parseRouteParams } from '@/lib/api/request';
import { toEmbeddingProviderApiError } from '@/lib/api/provider-errors';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireVaultDocsManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { RagIngestionError } from '@/lib/rag/ingest-documents';
import {
  indexWorkspaceDocForAskAi,
  WorkspaceDocAskAiIndexingError,
} from '@/lib/rag/index-workspace-doc';
import { vaultWorkspaceDocDetailRouteParamsSchema } from '@/lib/validators/workspace-doc';
import { EmbeddingProviderError } from '@/lib/providers/embedding-provider';

import type { RouteContext } from '@/lib/api/request';
import type { VaultWorkspaceDocDetailRouteParams } from '@/lib/validators/workspace-doc';
import type { NextRequest } from 'next/server';

const logger = createLogger('workspace-doc-publication-api');

function toAskAiIndexingErrorResponse(error: unknown) {
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

  return null;
}

export async function POST(
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

  try {
    const doc = await publishWorkspaceDoc({
      docId: params.docId,
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
    const askAiIndexingErrorResponse = toAskAiIndexingErrorResponse(error);

    if (askAiIndexingErrorResponse) {
      return askAiIndexingErrorResponse;
    }

    logger.error('Failed to publish workspace doc.', error, params);

    return apiUnexpectedError('Could not publish doc.');
  }
}

export async function DELETE(
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

  try {
    const doc = await unpublishWorkspaceDoc({
      docId: params.docId,
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
    const askAiIndexingErrorResponse = toAskAiIndexingErrorResponse(error);

    if (askAiIndexingErrorResponse) {
      return askAiIndexingErrorResponse;
    }

    logger.error('Failed to unpublish workspace doc.', error, params);

    return apiUnexpectedError('Could not unpublish doc.');
  }
}
