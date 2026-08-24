import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';

import { getDb } from '../src/db';
import { ensureDefaultVault } from '../src/db/queries/vaults';
import { createWorkspaceArea } from '../src/db/queries/workspace-areas';
import { archiveWorkspaceDoc, createWorkspaceDoc } from '../src/db/queries/workspace-docs';
import { workspaceAreas } from '../src/db/schema';

const defaultDatabaseUrl = 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';

type ArchivedDocFixture = {
  areaId: string;
  docId: string;
  docSlug: string;
  vaultSlug: string;
  title: string;
};

async function seedArchivedDocFixture(): Promise<ArchivedDocFixture> {
  process.env.DATABASE_URL ??= defaultDatabaseUrl;

  const db = getDb();
  const vault = await ensureDefaultVault(db);
  const title = `Archived Browser Note ${crypto.randomUUID()}`;
  const area = await createWorkspaceArea({
    db,
    description: null,
    icon: 'folder',
    name: `Archived Browser Area ${crypto.randomUUID()}`,
    vaultId: vault.id,
  });
  const doc = await createWorkspaceDoc({
    content: `# ${title}\n\nArchive visual check body.`,
    db,
    title,
    vaultId: vault.id,
    workspaceAreaId: area.id,
  });

  if (!doc) {
    throw new Error('Expected archived doc fixture to be created.');
  }

  const archivedDoc = await archiveWorkspaceDoc({
    db,
    docId: doc.id,
    vaultId: vault.id,
  });

  if (!archivedDoc) {
    throw new Error('Expected archived doc fixture to be archived.');
  }

  return {
    areaId: area.id,
    docId: doc.id,
    docSlug: doc.slug,
    title,
    vaultSlug: vault.slug,
  };
}

async function cleanupArchivedDocFixture(areaId: string) {
  const db = getDb();

  await db.delete(workspaceAreas).where(eq(workspaceAreas.id, areaId));
}

test('opens an archived workspace doc in read-only mode', async ({ page }) => {
  test.slow();

  const fixture = await seedArchivedDocFixture();

  try {
    await page.goto(`/vault/${fixture.vaultSlug}/archive`);
    await expect(page.getByRole('heading', { exact: true, name: 'Archive' })).toBeVisible();

    const archivedDocRow = page.getByRole('article').filter({ hasText: fixture.title });

    await expect(archivedDocRow.getByRole('link', { name: 'Open' })).toBeVisible();
    await archivedDocRow.getByRole('link', { name: 'Open' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/vault/${fixture.vaultSlug}/docs/${fixture.docSlug}/${fixture.docId}$`, 'u'),
      { timeout: 30_000 },
    );
    await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
    await expect(
      page.getByText('This doc is archived and available in read-only mode.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unarchive' })).toBeVisible();
    await expect(page.getByText('Archive visual check body.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Include in Ask AI' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Unarchive' }).click();

    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(fixture.title, {
      timeout: 30_000,
    });
    await expect(
      page.getByText('This doc is archived and available in read-only mode.'),
    ).toHaveCount(0);
  } finally {
    await cleanupArchivedDocFixture(fixture.areaId);
  }
});
