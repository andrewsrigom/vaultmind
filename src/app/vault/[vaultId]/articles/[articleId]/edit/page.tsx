import { notFound, redirect } from 'next/navigation';

import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { createVaultWorkspaceIndexesHref } from '@/lib/routes';

type VaultArticleEditPageProps = {
  params: Promise<{
    vaultId: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function VaultArticleEditPage({ params }: VaultArticleEditPageProps) {
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
