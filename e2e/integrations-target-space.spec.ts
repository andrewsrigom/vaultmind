import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';

import { getDb } from '../src/db';
import { ensureDefaultVault } from '../src/db/queries/vaults';
import { workspaceIndexes } from '../src/db/schema';

const defaultDatabaseUrl = 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';

async function seedTargetSpace() {
  process.env.DATABASE_URL ??= defaultDatabaseUrl;

  const db = getDb();
  const vault = await ensureDefaultVault(db);
  const [workspaceIndex] = await db
    .insert(workspaceIndexes)
    .values({
      description: 'Temporary browser-test space.',
      name: `Browser Source Space ${crypto.randomUUID()}`,
      vaultId: vault.id,
    })
    .returning();

  if (!workspaceIndex) {
    throw new Error('Expected the integration target space fixture to be created.');
  }

  return { vaultSlug: vault.slug, workspaceIndex };
}

async function cleanupTargetSpace(workspaceIndexId: string) {
  await getDb().delete(workspaceIndexes).where(eq(workspaceIndexes.id, workspaceIndexId));
}

test('requires and preserves an explicit target space before connecting sources', async ({
  page,
}) => {
  const fixture = await seedTargetSpace();

  try {
    await page.setViewportSize({ height: 720, width: 320 });
    await page.goto(`/vault/${fixture.vaultSlug}/integrations`);

    const targetSpaceSelect = page.getByRole('combobox', { name: 'Active space' });

    await expect(targetSpaceSelect).toBeVisible();
    await expect(targetSpaceSelect).toContainText('Select space');
    await expect(page.getByRole('heading', { exact: true, name: 'Notion' })).toHaveCount(0);

    await targetSpaceSelect.click();
    const targetSpaceOption = page.getByRole('option', {
      name: fixture.workspaceIndex.name,
    });
    await expect(targetSpaceOption).toBeVisible();
    await targetSpaceOption.click();

    await expect(page).toHaveURL(new RegExp(`workspaceIndexId=${fixture.workspaceIndex.id}`, 'u'));
    await expect(targetSpaceSelect).toContainText(fixture.workspaceIndex.name);
    await expect(page.getByRole('heading', { exact: true, name: 'Notion' })).toBeVisible();

    const pageWidths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));

    expect(pageWidths.scroll).toBeLessThanOrEqual(pageWidths.client);
  } finally {
    await cleanupTargetSpace(fixture.workspaceIndex.id);
  }
});
