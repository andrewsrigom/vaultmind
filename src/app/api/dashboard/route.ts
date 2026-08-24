import { getDashboardSummary } from '@/db/queries/workspace-indexes';
import { parseOptionalUuidSearchParam } from '@/lib/api/request';
import { apiDatabaseError, apiError, apiSuccess } from '@/lib/api/responses';
import { requireVaultAccessForRequest } from '@/lib/access/api-access';
import { createLogger } from '@/lib/logger';

import type { NextRequest } from 'next/server';

const logger = createLogger('dashboard-api');

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
    const summary = await getDashboardSummary({ vaultId: vaultId.value });

    return apiSuccess({ summary });
  } catch (error: unknown) {
    logger.error('Failed to load dashboard summary.', error);

    return apiDatabaseError('Could not load dashboard data.');
  }
}
