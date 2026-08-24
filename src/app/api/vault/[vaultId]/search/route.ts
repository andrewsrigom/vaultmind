import { searchVaultKnowledge } from '@/db/queries/search';
import { parseRouteParams } from '@/lib/api/request';
import { apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';
import { requireVaultDocsReadForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';
import { vaultSearchQuerySchema, vaultSearchRouteParamsSchema } from '@/lib/validators/search';

import type { RouteContext } from '@/lib/api/request';
import type { VaultSearchRouteParams } from '@/lib/validators/search';
import type { NextRequest } from 'next/server';

const logger = createLogger('vault-search-api');

export async function GET(request: NextRequest, context: RouteContext<VaultSearchRouteParams>) {
  const params = await parseRouteParams(context, vaultSearchRouteParamsSchema);

  if (!params) {
    return apiError('invalid-input', 'Vault ID must be a UUID.', 400);
  }

  const access = await requireVaultDocsReadForRequest({
    request,
    vaultId: params.vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedQuery = vaultSearchQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? '',
  });

  if (!parsedQuery.success) {
    return apiError('invalid-input', 'Search query is invalid.', 400);
  }

  try {
    const result = await searchVaultKnowledge({
      query: parsedQuery.data.q,
      vaultId: params.vaultId,
    });

    return apiSuccess({
      entries: result.entries.map((entry) => ({
        ...entry,
        updatedAt: entry.updatedAt.toISOString(),
      })),
      sourceCount: result.sourceCount,
    });
  } catch (error: unknown) {
    logger.error('Failed to search vault knowledge.', error, params);

    return apiUnexpectedError('Could not search docs.');
  }
}
