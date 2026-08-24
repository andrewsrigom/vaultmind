import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { isLocalAccessGranted } from '@/lib/access/local-access';

import type { Route } from 'next';

type RequirePageAccessInput = {
  returnTo: string;
};

type RequireVaultPageAccessInput = RequirePageAccessInput & {
  vaultId: string;
};

export type PageAccessContext = {
  unlocked: true;
};

export type VaultPageAccessContext = PageAccessContext & {
  vaultContext: {
    vaultId: string;
  };
};

function createUnlockPath(returnTo: string): Route {
  const params = new URLSearchParams({ next: returnTo });

  return `/unlock?${params.toString()}` as Route;
}

export async function requirePageAccess({
  returnTo,
}: RequirePageAccessInput): Promise<PageAccessContext> {
  if (!isLocalAccessGranted((await headers()).get('cookie'))) {
    redirect(createUnlockPath(returnTo));
  }

  return { unlocked: true };
}

export async function requireVaultPageAccess({
  returnTo,
  vaultId,
}: RequireVaultPageAccessInput): Promise<VaultPageAccessContext> {
  await requirePageAccess({ returnTo });

  return {
    unlocked: true,
    vaultContext: {
      vaultId,
    },
  };
}
