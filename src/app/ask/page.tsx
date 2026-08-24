import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { AppShell } from '@/components/app-shell';
import { ChatInterface } from '@/components/chat/chat-interface';
import { Button } from '@/components/ui/button';
import { getChatTranscript } from '@/db/queries/chat';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { listWorkspaceIndexes } from '@/db/queries/workspace-indexes';
import { defaultVaultId } from '@/db/schema';
import { requireVaultPageAccess } from '@/lib/access/page-access';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { createVaultAskHref, createVaultIntegrationsHref } from '@/lib/routes';

import type { ChatDisplayMessage } from '@/components/chat/types';

type AskPageSearchParams = {
  chatSessionId?: string;
  vaultId?: string;
  prompt?: string;
};

type AskPageProps = {
  searchParams: Promise<AskPageSearchParams>;
};

type RenderAskPageInput = {
  vaultId?: string | null;
  searchParams: Promise<AskPageSearchParams>;
};

export const dynamic = 'force-dynamic';

function normalizeInitialPrompt(prompt: string | undefined): string {
  return prompt?.trim().slice(0, 4_000) ?? '';
}

export async function renderAskPage({
  searchParams,
  vaultId: routeVaultId = null,
}: RenderAskPageInput) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const resolvedSearchParams = await searchParams;
  const vaultIdentifier = routeVaultId ?? resolvedSearchParams.vaultId ?? defaultVaultId;
  let databaseUnavailable = false;
  let selectedVault: Awaited<ReturnType<typeof getVaultByIdOrSlug>> = null;
  let workspaceIndexes: Awaited<ReturnType<typeof listWorkspaceIndexes>> = [];

  try {
    selectedVault = await getVaultByIdOrSlug(vaultIdentifier);
  } catch {
    databaseUnavailable = true;
  }

  if (!databaseUnavailable && routeVaultId && !selectedVault) {
    notFound();
  }

  const parsedChatSessionId = z.uuid().safeParse(resolvedSearchParams.chatSessionId);
  const selectedVaultId = selectedVault?.id ?? defaultVaultId;
  const vaultSlug = selectedVault?.slug ?? null;
  const askHref = createVaultAskHref({
    chatSessionId: resolvedSearchParams.chatSessionId,
    prompt: resolvedSearchParams.prompt,
    vaultId: selectedVaultId,
    vaultSlug,
  });

  if (!databaseUnavailable) {
    await requireVaultPageAccess({
      returnTo: askHref,
      vaultId: selectedVaultId,
    });
  }

  try {
    workspaceIndexes = await listWorkspaceIndexes({
      vaultId: selectedVaultId,
    });
  } catch {
    databaseUnavailable = true;
  }

  const chatTranscript =
    !databaseUnavailable && parsedChatSessionId.success
      ? await getChatTranscript({
          chatSessionId: parsedChatSessionId.data,
          vaultId: selectedVaultId,
        })
      : null;
  const sourceCount = workspaceIndexes.reduce(
    (totalSources, workspaceIndex) => totalSources + workspaceIndex.sourceCount,
    0,
  );
  const syncedDocumentCount = workspaceIndexes.reduce(
    (totalDocuments, workspaceIndex) => totalDocuments + workspaceIndex.documentCount,
    0,
  );
  const searchableChunkCount = workspaceIndexes.reduce(
    (totalChunks, workspaceIndex) => totalChunks + workspaceIndex.chunkCount,
    0,
  );
  const isDisabled = databaseUnavailable || searchableChunkCount === 0;
  const disabledReason = databaseUnavailable
    ? dictionary.chat.hub.databaseOverlay.title
    : sourceCount === 0
      ? dictionary.chat.hub.noWorkspaceIndexes.description
      : syncedDocumentCount === 0
        ? dictionary.chat.hub.noVaultDocuments.description
        : searchableChunkCount === 0
          ? dictionary.chat.hub.noVaultDocuments.description
          : null;
  const initialMessages: ChatDisplayMessage[] =
    chatTranscript?.messages.map((message) => ({
      content: message.content,
      id: message.id,
      role: message.role,
    })) ?? [];
  return (
    <AppShell activeVaultId={selectedVaultId} activeWorkspaceIndexId={null}>
      <ChatInterface
        areaId={null}
        conversationRoute="ask"
        disabledAction={
          sourceCount === 0 ? (
            <Button asChild size="sm" variant="outline">
              <Link
                href={createVaultIntegrationsHref({
                  vaultId: selectedVaultId,
                  vaultSlug,
                })}
              >
                {dictionary.integrations.cta}
              </Link>
            </Button>
          ) : null
        }
        disabledReason={disabledReason}
        emptyStateVariant="input-only"
        initialChatSessionId={chatTranscript?.session.id ?? null}
        initialMessages={initialMessages}
        initialMessageWorkspaceIndexId={chatTranscript?.session.workspaceIndexId ?? null}
        initialPrompt={normalizeInitialPrompt(resolvedSearchParams.prompt)}
        initialSources={chatTranscript?.latestSources ?? []}
        isDisabled={isDisabled}
        key={`ask-${chatTranscript?.session.id ?? 'new'}-${resolvedSearchParams.prompt ?? ''}`}
        vaultId={selectedVaultId}
        vaultSlug={vaultSlug}
        strings={{
          ...dictionary.chat.interface,
          input: dictionary.chat.input,
        }}
        workspaceIndex={null}
        workspaceIndexId={null}
        workspaceIndexes={[]}
      />
    </AppShell>
  );
}

export default async function AskPage({ searchParams }: AskPageProps) {
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
