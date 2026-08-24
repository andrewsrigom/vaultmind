import { getVaultById } from '@/db/queries/vaults';
import { listWorkspaceIndexes } from '@/db/queries/workspace-indexes';
import { getWorkspaceArea } from '@/db/queries/workspace-areas';
import { getChatStreamErrorMessage, toChatApiErrorResponse } from '@/lib/api/chat-errors';
import { createPreparedChatStreamResponse, toChatResponseBody } from '@/lib/api/chat-stream';
import { parseJsonRequestBody, parseVaultIdParam } from '@/lib/api/request';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { requireVaultDocsReadForRequest } from '@/lib/access/api-access';
import { getLocale } from '@/lib/i18n-server';
import { createLogger } from '@/lib/logger';
import { generateAnswer, prepareChatAnswer } from '@/lib/rag/generate-answer';
import { chatRequestSchema } from '@/lib/validators/chat';

import type { NextRequest } from 'next/server';
import type { GenerateAnswerInput } from '@/lib/rag/generate-answer';
import type { VaultRouteContext } from '@/lib/api/request';

const logger = createLogger('vault-chat-api');

export async function POST(request: NextRequest, context: VaultRouteContext) {
  const vaultId = await parseVaultIdParam(context);

  if (!vaultId) {
    return apiError('invalid-input', 'Vault ID must be a UUID.', 400);
  }

  const access = await requireVaultDocsReadForRequest({
    request,
    vaultId,
  });

  if (!access.ok) {
    return access.response;
  }

  const parsedBody = await parseJsonRequestBody(request, chatRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  try {
    const vault = await getVaultById(vaultId);

    if (!vault) {
      return apiError('not-found', 'Vault was not found.', 404);
    }

    if (parsedBody.data.areaId) {
      const workspaceArea = await getWorkspaceArea({
        vaultId,
        workspaceAreaId: parsedBody.data.areaId,
      });

      if (!workspaceArea) {
        return apiError('not-found', 'Workspace area was not found.', 404);
      }
    }

    const workspaceIndexes = await listWorkspaceIndexes({ vaultId });
    const searchableWorkspaceIndexes = workspaceIndexes.filter(
      (workspaceIndex) => workspaceIndex.chunkCount > 0,
    );

    if (searchableWorkspaceIndexes.length === 0) {
      return apiError(
        'source-not-configured',
        'No synced documents are available in this vault.',
        409,
      );
    }

    const primaryWorkspaceIndex = searchableWorkspaceIndexes[0];

    if (!primaryWorkspaceIndex) {
      return apiError(
        'source-not-configured',
        'No synced documents are available in this vault.',
        409,
      );
    }

    const answerInput: GenerateAnswerInput = {
      answerLanguage: await getLocale(),
      question: parsedBody.data.message,
      retrievalWorkspaceIndexIds: searchableWorkspaceIndexes.map(
        (workspaceIndex) => workspaceIndex.id,
      ),
      workspaceIndexId: primaryWorkspaceIndex.id,
    };

    if (parsedBody.data.areaId) {
      answerInput.workspaceAreaId = parsedBody.data.areaId;
    }

    if (parsedBody.data.chatSessionId) {
      answerInput.chatSessionId = parsedBody.data.chatSessionId;
    }

    if (parsedBody.data.stream) {
      const prepared = await prepareChatAnswer(answerInput);

      return createPreparedChatStreamResponse({
        getErrorMessage: (error) =>
          getChatStreamErrorMessage({
            error,
            logContext: { vaultId },
            logger,
            logMessage: 'Failed to stream vault chat answer.',
          }),
        prepared,
      });
    }

    const result = await generateAnswer(answerInput);

    return apiSuccess(toChatResponseBody(result));
  } catch (error: unknown) {
    return toChatApiErrorResponse({
      error,
      logContext: { vaultId },
      logger,
      logMessage: 'Failed to generate vault chat answer.',
    });
  }
}
