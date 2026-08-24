import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/app-shell';

const vault = {
  description: 'Personal knowledge vault.',
  id: '00000000-0000-4000-8000-00000000a001',
  name: 'VaultMind',
  slug: 'vault',
};

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn(),
  getVaultByIdOrSlug: vi.fn(),
  listWorkspaceAreas: vi.fn(),
  listWorkspaceDocs: vi.fn(),
  requirePageAccess: vi.fn(),
}));

vi.mock('@/lib/access/page-access', () => ({
  requirePageAccess: mocks.requirePageAccess,
}));

vi.mock('@/lib/i18n-server', () => ({
  getLocale: mocks.getLocale,
}));

vi.mock('@/db/queries/vaults', () => ({
  getVaultByIdOrSlug: mocks.getVaultByIdOrSlug,
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
  mocks.getVaultByIdOrSlug.mockResolvedValue(vault);
  mocks.listWorkspaceAreas.mockResolvedValue([]);
  mocks.listWorkspaceDocs.mockResolvedValue([]);
  mocks.requirePageAccess.mockResolvedValue(undefined);
});

describe('AppShell personal vault boundary', () => {
  it('checks local access and loads navigation for the selected vault', async () => {
    await AppShell({
      activeVaultId: vault.id,
      children: null,
    });

    expect(mocks.requirePageAccess).toHaveBeenCalledWith({ returnTo: '/' });
    expect(mocks.getVaultByIdOrSlug).toHaveBeenCalledWith(vault.id);
    expect(mocks.listWorkspaceAreas).toHaveBeenCalledWith({ vaultId: vault.id });
    expect(mocks.listWorkspaceDocs).toHaveBeenCalledWith({ vaultId: vault.id });
  });

  it('still renders the shell when the database is unavailable', async () => {
    mocks.getVaultByIdOrSlug.mockRejectedValue(new Error('database unavailable'));
    mocks.listWorkspaceAreas.mockRejectedValue(new Error('database unavailable'));
    mocks.listWorkspaceDocs.mockRejectedValue(new Error('database unavailable'));

    await expect(AppShell({ children: null })).resolves.toBeTruthy();
  });
});
