'use client';

import { Database } from 'lucide-react';

import { ChatInterface } from '@/components/chat/chat-interface';
import { DatabaseUnavailableState } from '@/components/database-unavailable-state';
import { EmptyState } from '@/components/empty-state';
import { SectionHeader } from '@/components/section-header';
import { SyncLatestButton } from '@/components/sources/sync-latest-button';
import { createVaultIntegrationsHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import type { ChatDisplayMessage, ChatRetrievedSource } from '@/components/chat/types';
import type { WorkspaceAreaIconName } from '@/db/schema';
import type { WorkspaceIndexKpiSummary } from '@/db/queries/knowledge-events';
import type { Dictionary } from '@/lib/i18n';

export type ChatHubWorkspaceIndex = {
  chunkCount: number;
  description: string | null;
  documentCount: number;
  id: string;
  icon: WorkspaceAreaIconName;
  kpiSummary: WorkspaceIndexKpiSummary;
  lastSyncedAt: string | null;
  name: string;
  sourceCount: number;
  syncedSourceCount: number;
};

type ChatHubProps = {
  databaseUnavailable: boolean;
  initialChatSessionId: string | null;
  initialWorkspaceIndexId: string | null;
  initialMessageWorkspaceIndexId: string | null;
  initialMessages: ChatDisplayMessage[];
  initialPrompt: string;
  initialSources: ChatRetrievedSource[];
  workspaceIndexes: ChatHubWorkspaceIndex[];
  vaultId: string | null;
  vaultSlug?: string | null;
  strings: Dictionary;
};

function getSelectedWorkspaceIndex(
  workspaceIndexes: ChatHubWorkspaceIndex[],
  selectedWorkspaceIndexId: string | null,
): ChatHubWorkspaceIndex | null {
  return (
    workspaceIndexes.find((workspaceIndex) => workspaceIndex.id === selectedWorkspaceIndexId) ??
    null
  );
}

export function ChatHub({
  databaseUnavailable,
  initialChatSessionId,
  initialMessages,
  initialMessageWorkspaceIndexId,
  initialPrompt,
  initialSources,
  initialWorkspaceIndexId,
  strings,
  vaultId,
  vaultSlug,
  workspaceIndexes,
}: ChatHubProps) {
  const selectedWorkspaceIndexId = initialWorkspaceIndexId;
  const selectedWorkspaceIndex = getSelectedWorkspaceIndex(
    workspaceIndexes,
    selectedWorkspaceIndexId,
  );
  const hasWorkspaceIndexes = workspaceIndexes.length > 0;
  const vaultDocumentCount = workspaceIndexes.reduce(
    (totalDocuments, workspaceIndex) => totalDocuments + workspaceIndex.documentCount,
    0,
  );
  const hasDocuments = selectedWorkspaceIndex
    ? selectedWorkspaceIndex.documentCount > 0
    : vaultDocumentCount > 0;
  const disabledReason = databaseUnavailable
    ? strings.chat.hub.databaseOverlay.title
    : selectedWorkspaceIndex && !hasDocuments
      ? strings.chat.hub.noDocuments.description
      : !selectedWorkspaceIndex && hasWorkspaceIndexes && !hasDocuments
        ? strings.chat.hub.noVaultDocuments.description
        : null;
  const integrationsHref = createVaultIntegrationsHref({ vaultId });

  return (
    <section className="relative">
      <div
        className={cn(
          'grid gap-5',
          databaseUnavailable ? 'pointer-events-none select-none opacity-45' : null,
        )}
      >
        {!hasWorkspaceIndexes && !databaseUnavailable ? (
          <EmptyState
            actionHref={integrationsHref}
            actionLabel={strings.integrations.cta}
            description={strings.chat.hub.noWorkspaceIndexes.description}
            icon={Database}
            title={strings.chat.hub.noWorkspaceIndexes.title}
          />
        ) : null}

        {selectedWorkspaceIndex && !hasDocuments && !databaseUnavailable ? (
          <section className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-muted)] p-5 text-[var(--warning-foreground)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader
                description={strings.chat.hub.noDocuments.description}
                descriptionClassName="text-[var(--warning-foreground)]"
                title={strings.chat.hub.noDocuments.title}
                titleVariant="panel"
              />
              <SyncLatestButton
                workspaceIndexId={selectedWorkspaceIndex.id}
                label={strings.source.sync.latest}
                strings={strings.source.sync}
              />
            </div>
          </section>
        ) : null}

        {hasWorkspaceIndexes || databaseUnavailable ? (
          <ChatInterface
            areaId={selectedWorkspaceIndex?.id ?? null}
            disabledReason={disabledReason}
            initialChatSessionId={initialChatSessionId}
            initialMessages={initialMessages}
            initialMessageWorkspaceIndexId={initialMessageWorkspaceIndexId}
            initialPrompt={initialPrompt}
            initialSources={initialSources}
            isDisabled={databaseUnavailable || !hasDocuments}
            key={`${selectedWorkspaceIndex?.id ?? 'no-base'}-${initialChatSessionId ?? 'new'}-${initialPrompt}`}
            workspaceIndex={selectedWorkspaceIndex}
            workspaceIndexes={workspaceIndexes}
            workspaceIndexId={null}
            vaultId={vaultId}
            vaultSlug={vaultSlug ?? null}
            strings={{
              ...strings.chat.interface,
              input: strings.chat.input,
            }}
          />
        ) : null}
      </div>

      {databaseUnavailable ? (
        <div className="absolute inset-0 z-10 flex items-start justify-center bg-[var(--background)]/75 px-4 py-10 backdrop-blur-sm">
          <DatabaseUnavailableState
            className="w-full max-w-lg shadow-lg"
            description={strings.chat.hub.databaseOverlay.description}
            steps={strings.chat.hub.databaseOverlay.steps}
            title={strings.chat.hub.databaseOverlay.title}
          />
        </div>
      ) : null}
    </section>
  );
}
