import { renderAskPage } from '@/app/ask/page';

type VaultAskPageProps = {
  params: Promise<{
    vaultId: string;
  }>;
  searchParams: Promise<{
    chatSessionId?: string;
    vaultId?: string;
    prompt?: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function VaultAskPage({ params, searchParams }: VaultAskPageProps) {
  const { vaultId } = await params;

  return renderAskPage({ searchParams, vaultId });
}
