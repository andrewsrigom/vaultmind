import { redirect } from 'next/navigation';

import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { createVaultAskHref } from '@/lib/routes';

type VaultChatPageProps = {
  params: Promise<{
    vaultId: string;
  }>;
  searchParams: Promise<{
    areaId?: string;
    chatSessionId?: string;
    workspaceIndexId?: string;
    vaultId?: string;
    prompt?: string;
    scope?: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function VaultChatPage({ params, searchParams }: VaultChatPageProps) {
  const { vaultId } = await params;
  const resolvedSearchParams = await searchParams;
  const vault = await getVaultByIdOrSlug(vaultId);

  redirect(
    createVaultAskHref({
      chatSessionId: resolvedSearchParams.chatSessionId,
      prompt: resolvedSearchParams.prompt,
      vaultId: vault?.id ?? vaultId,
      vaultSlug: vault?.slug,
    }),
  );
}
