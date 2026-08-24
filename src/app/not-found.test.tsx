import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NotFound from '@/app/not-found';

const mocks = vi.hoisted(() => ({
  appShell: vi.fn(),
  countUnreadUserNotificationEvents: vi.fn(),
  getLocale: vi.fn(),
  listVaults: vi.fn(),
  listVaultsForUser: vi.fn(),
  listWorkspaceAreas: vi.fn(),
  listWorkspaceDocs: vi.fn(),
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: mocks.appShell,
}));

vi.mock('@/lib/i18n-server', () => ({
  getLocale: mocks.getLocale,
}));

vi.mock('@/db/queries/notification-events', () => ({
  countUnreadUserNotificationEvents: mocks.countUnreadUserNotificationEvents,
}));

vi.mock('@/db/queries/vaults', () => ({
  listVaults: mocks.listVaults,
  listVaultsForUser: mocks.listVaultsForUser,
}));

vi.mock('@/db/queries/workspace-areas', () => ({
  listWorkspaceAreas: mocks.listWorkspaceAreas,
}));

vi.mock('@/db/queries/workspace-docs', () => ({
  listWorkspaceDocs: mocks.listWorkspaceDocs,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLocale.mockResolvedValue('en');
});

describe('NotFound', () => {
  it('renders as a public page without loading private shell data', async () => {
    const element = await NotFound();
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('<main');
    expect(mocks.appShell).not.toHaveBeenCalled();
    expect(mocks.listVaults).not.toHaveBeenCalled();
    expect(mocks.listVaultsForUser).not.toHaveBeenCalled();
    expect(mocks.listWorkspaceAreas).not.toHaveBeenCalled();
    expect(mocks.listWorkspaceDocs).not.toHaveBeenCalled();
    expect(mocks.countUnreadUserNotificationEvents).not.toHaveBeenCalled();
  });
});
