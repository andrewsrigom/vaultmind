import { defineConfig, devices } from '@playwright/test';

import type { PlaywrightTestConfig } from '@playwright/test';

const playwrightPort = process.env.PLAYWRIGHT_PORT ?? '3000';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${playwrightPort}`;

const config: PlaywrightTestConfig = {
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  reporter: [['list']],
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
};

if (!process.env.PLAYWRIGHT_BASE_URL) {
  config.webServer = {
    command: `pnpm exec next dev --port ${playwrightPort}`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'true',
    stderr: 'pipe',
    stdout: 'pipe',
    timeout: 120_000,
    url: baseURL,
  };
}

export default defineConfig(config);
