import { renderIntegrationsPage } from '@/app/integrations/page';

type VaultIntegrationsPageProps = {
  params: Promise<{
    vaultId: string;
  }>;
  searchParams: Promise<{
    googleDrive?: string;
    notion?: string;
    vaultId?: string;
    workspaceIndexId?: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function VaultIntegrationsPage({
  params,
  searchParams,
}: VaultIntegrationsPageProps) {
  const { vaultId } = await params;

  return renderIntegrationsPage({ searchParams, vaultId });
}
