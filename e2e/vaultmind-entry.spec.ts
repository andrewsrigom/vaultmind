import { expect, test } from '@playwright/test';

test.describe('VaultMind entry', () => {
  test.use({ viewport: { height: 720, width: 320 } });

  test('opens the knowledge workspace on a narrow viewport', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/vault\/vault\/ask$/u);
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    await expect(page.getByText('Personal knowledge vault')).toBeVisible();
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));

    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
});
