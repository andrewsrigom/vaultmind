import { AppShell } from '@/components/app-shell';
import { ChatHub } from '@/components/chat/chat-hub';
import { getChatTranscript } from '@/db/queries/chat';
import { getWorkspaceIndexKpiSummary } from '@/db/queries/knowledge-events';
import { listWorkspaceIndexes } from '@/db/queries/workspace-indexes';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { listWorkspaceAreas } from '@/db/queries/workspace-areas';
import { defaultVaultId } from '@/db/schema';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { allAreasSelectorId, createVaultAskHref } from '@/lib/routes';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import type { AppSidebarWorkspaceIndexItem } from '@/components/app-sidebar';
import type { ChatHubWorkspaceIndex } from '@/components/chat/chat-hub';
import type { ChatDisplayMessage } from '@/components/chat/types';
import type { WorkspaceIndexKpiSummary } from '@/db/queries/knowledge-events';
import type { WorkspaceIndexListItem } from '@/db/queries/workspace-indexes';
import type { VaultListItem } from '@/db/queries/vaults';
import type { WorkspaceAreaListItem } from '@/db/queries/workspace-areas';

type ChatPageSearchParams = {
  areaId?: string;
  chatSessionId?: string;
  workspaceIndexId?: string;
  vaultId?: string;
  prompt?: string;
  scope?: string;
};

type ChatPageProps = {
  searchParams: Promise<ChatPageSearchParams>;
};

type RenderChatPageInput = {
  vaultId?: string | null;
  searchParams: Promise<ChatPageSearchParams>;
};

export const dynamic = 'force-dynamic';

const emptyKpiSummary: WorkspaceIndexKpiSummary = {
  answerGeneratedCount: 0,
  answerRefusedCount: 0,
  answerSuccessRate: null,
  conflictingSignalCount: 0,
  helpfulRate: null,
  helpfulSignalCount: 0,
  issueSignalCount: 0,
  missingSourceSignalCount: 0,
  notHelpfulSignalCount: 0,
  outdatedSignalCount: 0,
  questionCount: 0,
  sourceCitationCount: 0,
  sourceSyncFailureCount: 0,
  sourceSyncSuccessCount: 0,
  trustSignalCount: 0,
  wrongScopeSignalCount: 0,
};

function normalizeInitialPrompt(prompt: string | undefined): string {
  return prompt?.trim().slice(0, 4_000) ?? '';
}

function getInitialAreaId(
  workspaceAreas: WorkspaceAreaListItem[],
  requestedAreaId: string | undefined,
): string | null {
  if (
    requestedAreaId &&
    workspaceAreas.some((workspaceArea) => workspaceArea.id === requestedAreaId)
  ) {
    return requestedAreaId;
  }
  return null;
}

function toChatHubArea(
  workspaceArea: WorkspaceAreaListItem,
  kpiSummary: WorkspaceIndexKpiSummary,
): ChatHubWorkspaceIndex {
  return {
    chunkCount: workspaceArea.chunkCount,
    description: workspaceArea.description,
    documentCount: workspaceArea.documentCount,
    icon: workspaceArea.icon,
    id: workspaceArea.id,
    kpiSummary,
    lastSyncedAt: null,
    name: workspaceArea.name,
    sourceCount: 0,
    syncedSourceCount: 0,
  };
}

function toAreaItem(workspaceArea: WorkspaceAreaListItem): AppSidebarWorkspaceIndexItem {
  return {
    icon: workspaceArea.icon,
    id: workspaceArea.id,
    name: workspaceArea.name,
    slug: workspaceArea.slug,
  };
}

export async function renderChatPage({
  searchParams,
  vaultId: routeVaultId = null,
}: RenderChatPageInput) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const resolvedSearchParams = await searchParams;
  let databaseUnavailable = false;
  let workspaceIndexes: WorkspaceIndexListItem[] = [];
  let workspaceAreas: WorkspaceAreaListItem[] = [];
  const vaultIdentifier = routeVaultId ?? resolvedSearchParams.vaultId ?? defaultVaultId;
  let selectedVault: VaultListItem | null = null;

  try {
    selectedVault = await getVaultByIdOrSlug(vaultIdentifier);
    const selectedVaultId = selectedVault?.id ?? defaultVaultId;

    [workspaceIndexes, workspaceAreas] = await Promise.all([
      listWorkspaceIndexes({ vaultId: selectedVaultId }),
      listWorkspaceAreas({ vaultId: selectedVaultId }),
    ]);
  } catch {
    databaseUnavailable = true;
  }

  if (!databaseUnavailable && routeVaultId && !selectedVault) {
    notFound();
  }

  const parsedChatSessionId = z.uuid().safeParse(resolvedSearchParams.chatSessionId);
  const selectedVaultId = selectedVault?.id ?? defaultVaultId;
  const shouldUseVaultScope = resolvedSearchParams.scope === 'vault';
  const requestedAreaId = resolvedSearchParams.areaId ?? resolvedSearchParams.workspaceIndexId;
  const chatTranscript =
    !databaseUnavailable && parsedChatSessionId.success
      ? await getChatTranscript({
          chatSessionId: parsedChatSessionId.data,
          vaultId: selectedVaultId,
        })
      : null;
  const initialAreaId = databaseUnavailable
    ? null
    : shouldUseVaultScope
      ? null
      : getInitialAreaId(workspaceAreas, requestedAreaId);
  const selectedKpiSummary =
    !databaseUnavailable && chatTranscript?.session.workspaceIndexId
      ? await getWorkspaceIndexKpiSummary({
          workspaceIndexId: chatTranscript.session.workspaceIndexId,
        })
      : emptyKpiSummary;
  const initialMessages: ChatDisplayMessage[] =
    chatTranscript?.messages.map((message) => ({
      content: message.content,
      id: message.id,
      role: message.role,
    })) ?? [];

  return (
    <AppShell
      activeWorkspaceIndexId={initialAreaId}
      activeVaultId={selectedVaultId}
      workspaceIndexSelector={{
        isDisabled: databaseUnavailable || workspaceAreas.length === 0,
        items: [
          {
            icon: 'folder',
            id: allAreasSelectorId,
            name: dictionary.chat.hub.allAreas,
            slug: allAreasSelectorId,
          },
          ...workspaceAreas.map(toAreaItem),
        ],
        selectedId: initialAreaId ?? allAreasSelectorId,
      }}
    >
      <ChatHub
        databaseUnavailable={databaseUnavailable}
        initialChatSessionId={chatTranscript?.session.id ?? null}
        initialWorkspaceIndexId={initialAreaId}
        initialMessageWorkspaceIndexId={
          chatTranscript?.session.workspaceIndexId ?? workspaceIndexes[0]?.id ?? null
        }
        initialMessages={initialMessages}
        initialPrompt={normalizeInitialPrompt(resolvedSearchParams.prompt)}
        initialSources={chatTranscript?.latestSources ?? []}
        workspaceIndexes={workspaceAreas.map((workspaceArea) =>
          toChatHubArea(
            workspaceArea,
            workspaceArea.id === initialAreaId ? selectedKpiSummary : emptyKpiSummary,
          ),
        )}
        vaultId={selectedVaultId}
        vaultSlug={selectedVault?.slug ?? null}
        strings={dictionary}
      />
    </AppShell>
  );
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const resolvedSearchParams = await searchParams;
  const vault = await getVaultByIdOrSlug(resolvedSearchParams.vaultId ?? defaultVaultId);
  const vaultId = vault?.id ?? defaultVaultId;

  redirect(
    createVaultAskHref({
      chatSessionId: resolvedSearchParams.chatSessionId,
      prompt: resolvedSearchParams.prompt,
      vaultId,
      vaultSlug: vault?.slug,
    }),
  );
}
