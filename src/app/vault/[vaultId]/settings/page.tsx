import { renderSettingsPage } from '@/app/settings/page';

type VaultSettingsPageProps = {
  params: Promise<{
    vaultId: string;
  }>;
  searchParams: Promise<{
    vaultId?: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function VaultSettingsPage({ params, searchParams }: VaultSettingsPageProps) {
  const { vaultId } = await params;

  return renderSettingsPage({ searchParams, vaultId });
}
