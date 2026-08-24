import { eq, or } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  defaultVaultDescription,
  defaultVaultId,
  defaultVaultName,
  defaultVaultSlug,
  vaults,
} from '@/db/schema';

import type { Db } from '@/db';
import type { Vault } from '@/db/schema';

export type VaultListItem = {
  description: string | null;
  id: string;
  name: string;
  slug: string;
};

function toVaultListItem(vault: Vault): VaultListItem {
  return {
    description: vault.description,
    id: vault.id,
    name: vault.name,
    slug: vault.slug,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export async function ensureDefaultVault(db: Db = getDb()): Promise<Vault> {
  await db
    .insert(vaults)
    .values({
      description: defaultVaultDescription,
      id: defaultVaultId,
      name: defaultVaultName,
      slug: defaultVaultSlug,
    })
    .onConflictDoNothing({ target: vaults.id });

  const [vault] = await db.select().from(vaults).where(eq(vaults.id, defaultVaultId)).limit(1);

  if (!vault) {
    throw new Error('Failed to load default vault.');
  }

  return vault;
}

export async function getVaultById(vaultId: string): Promise<VaultListItem | null> {
  const db = getDb();
  const [vault] = await db.select().from(vaults).where(eq(vaults.id, vaultId)).limit(1);

  return vault ? toVaultListItem(vault) : null;
}

export async function getVaultByIdOrSlug(
  vaultIdentifier: string,
  db: Db = getDb(),
): Promise<VaultListItem | null> {
  const normalizedIdentifier = vaultIdentifier.trim();

  if (!normalizedIdentifier) {
    return null;
  }

  if (normalizedIdentifier === defaultVaultId || normalizedIdentifier === defaultVaultSlug) {
    await ensureDefaultVault(db);
  }

  const [vault] = await db
    .select()
    .from(vaults)
    .where(
      isUuid(normalizedIdentifier)
        ? or(eq(vaults.id, normalizedIdentifier), eq(vaults.slug, normalizedIdentifier))
        : eq(vaults.slug, normalizedIdentifier),
    )
    .limit(1);

  return vault ? toVaultListItem(vault) : null;
}
