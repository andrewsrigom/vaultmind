import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';

import { getDb } from '../src/db';
import { ensureDefaultVault } from '../src/db/queries/vaults';
import { createWorkspaceArea } from '../src/db/queries/workspace-areas';
import { getOrCreateWorkspaceAreaHomeDoc } from '../src/db/queries/workspace-docs';
import { workspaceAreas } from '../src/db/schema';

const defaultDatabaseUrl = 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';

test('loads the default workspace chat', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/VaultMind/);
  await expect(page).toHaveURL(/\/vault\/vault\/ask$/u);
  await expect(page.locator('body')).toContainText('VaultMind');
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible();
});

test('opens a space as its workspace doc home', async ({ page }) => {
  process.env.DATABASE_URL ??= defaultDatabaseUrl;

  const db = getDb();
  const vault = await ensureDefaultVault(db);
  const areaName = `Browser Home Space ${crypto.randomUUID()}`;
  const area = await createWorkspaceArea({
    db,
    description: 'Temporary browser-test space home.',
    name: areaName,
    vaultId: vault.id,
  });
  const homeDoc = await getOrCreateWorkspaceAreaHomeDoc({
    db,
    vaultId: vault.id,
    workspaceAreaId: area.id,
  });

  if (!homeDoc) {
    throw new Error('Expected the browser-test space home to be created.');
  }

  try {
    await page.goto(`/vault/${vault.slug}/areas/${area.slug}`);

    await expect(page).toHaveURL(
      new RegExp(`/vault/${vault.slug}/docs/${homeDoc.slug}/${homeDoc.id}$`, 'u'),
    );
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(areaName);
  } finally {
    await db.delete(workspaceAreas).where(eq(workspaceAreas.id, area.id));
  }
});
