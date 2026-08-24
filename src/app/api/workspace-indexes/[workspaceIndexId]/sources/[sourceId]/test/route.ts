import { getDb } from '@/db';
import { getSourceCredentialSecret, SourceCredentialError } from '@/db/queries/source-credentials';
import { getSyncableWorkspaceSource } from '@/db/queries/sync-jobs';
import { parseWorkspaceIndexSourceParams } from '@/lib/api/request';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { requireSourceManagementForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { SourceAdapterError } from '@/lib/sources/errors';
import { getSourceAdapter } from '@/lib/sources/registry';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexSourceRouteContext } from '@/lib/api/request';

const logger = createLogger('workspace-index-source-test-api');

export async function POST(request: NextRequest, context: WorkspaceIndexSourceRouteContext) {
  const params = await parseWorkspaceIndexSourceParams(context);

  if (!params) {
    return apiError('invalid-input', 'Workspace index ID and source ID must be UUIDs.', 400);
  }

  const access = await requireSourceManagementForRequest({
    request,
    workspaceIndexId: params.workspaceIndexId,
  });

  if (!access.ok) {
    return access.response;
  }

  const db = getDb();
  const source = await getSyncableWorkspaceSource({
    db,
    sourceId: params.sourceId,
    workspaceIndexId: params.workspaceIndexId,
  });

  if (!source) {
    return apiError('not-found', 'Source was not found for this workspace.', 404);
  }

  try {
    const adapter = getSourceAdapter(source.type);

    if (!adapter.listResources) {
      return apiError(
        'invalid-input',
        'This source type does not support connection testing.',
        400,
      );
    }

    const credential = await getSourceCredentialSecret({
      db,
      sourceId: source.id,
    });
    const resources = await adapter.listResources({
      ...(credential ? { credential } : {}),
    });

    return apiSuccess({
      resourceCount: resources.length,
      source: {
        id: source.id,
        name: source.name,
        type: source.type,
      },
    });
  } catch (error: unknown) {
    if (error instanceof SourceCredentialError) {
      return apiError(error.code, error.message, error.status);
    }

    if (error instanceof SourceAdapterError) {
      return apiError(error.code, error.message, error.status);
    }

    logger.error('Failed to test workspace source.', error, params);

    return apiError(
      'unexpected-error',
      'Could not test this source. Check the connection and try again.',
      500,
    );
  }
}
