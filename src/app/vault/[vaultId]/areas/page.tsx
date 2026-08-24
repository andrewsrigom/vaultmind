import { renderWorkspaceIndexesPage } from '@/app/areas/page';

type VaultWorkspaceIndexesPageProps = {
  params: Promise<{
    vaultId: string;
  }>;
  searchParams: Promise<{
    vaultId?: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function VaultWorkspaceIndexesPage({
  params,
  searchParams,
}: VaultWorkspaceIndexesPageProps) {
  const { vaultId } = await params;

  return renderWorkspaceIndexesPage({ searchParams, vaultId });
}
