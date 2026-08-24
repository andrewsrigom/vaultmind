import { redirect } from 'next/navigation';

import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { defaultVaultId } from '@/db/schema';
import { createVaultWorkspaceIndexesHref } from '@/lib/routes';

type ArticlesPageProps = {
  searchParams: Promise<{
    vaultId?: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const { vaultId } = await searchParams;
  const vault = await getVaultByIdOrSlug(vaultId ?? defaultVaultId);

  redirect(
    createVaultWorkspaceIndexesHref({
      vaultId: vault?.id ?? defaultVaultId,
      vaultSlug: vault?.slug,
    }),
  );
}
