import { notFound, redirect } from 'next/navigation';

import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { createVaultWorkspaceIndexesHref } from '@/lib/routes';

type VaultArticleDetailPageProps = {
  params: Promise<{
    vaultId: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function VaultArticleDetailPage({ params }: VaultArticleDetailPageProps) {
  const { vaultId } = await params;
  const vault = await getVaultByIdOrSlug(vaultId);

  if (!vault) {
    notFound();
  }

  redirect(
    createVaultWorkspaceIndexesHref({
      vaultId: vault.id,
      vaultSlug: vault.slug,
    }),
  );
}
