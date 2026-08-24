import type { ReactNode } from 'react';

type VaultLayoutProps = {
  children: ReactNode;
  params: Promise<{
    vaultId: string;
  }>;
};

export default async function VaultLayout({ children }: VaultLayoutProps) {
  return children;
}
