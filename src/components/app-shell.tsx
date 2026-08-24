import { AppFrame } from '@/components/app-frame';
import { AppSidebar } from '@/components/app-sidebar';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { listWorkspaceAreas } from '@/db/queries/workspace-areas';
import { listWorkspaceDocs } from '@/db/queries/workspace-docs';
import { defaultVaultId } from '@/db/schema';
import { isLocalAccessEnabled } from '@/lib/access/local-access';
import { requirePageAccess } from '@/lib/access/page-access';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';

import type {
  AppSidebarVaultItem,
  AppSidebarWorkspaceDocItem,
  AppSidebarWorkspaceIndexItem,
} from '@/components/app-sidebar';
import type { WorkspaceAreaListItem } from '@/db/queries/workspace-areas';
import type { WorkspaceDocListItem } from '@/db/queries/workspace-docs';
import type { ReactNode } from 'react';

type AppShellWorkspaceIndexSelector = {
  isDisabled: boolean;
  items: AppSidebarWorkspaceIndexItem[];
  selectedId: string | null;
};

type AppShellWorkspaceDocSelector = {
  items: AppSidebarWorkspaceDocItem[];
};

type AppShellProps = {
  activeWorkspaceIndexId?: string | null;
  activeVaultId?: string | null;
  children: ReactNode;
  currentPageLabel?: string | null;
  workspaceDocSelector?: AppShellWorkspaceDocSelector | null;
  workspaceIndexSelector?: AppShellWorkspaceIndexSelector | null;
};

function toWorkspaceIndexItem(workspaceArea: WorkspaceAreaListItem): AppSidebarWorkspaceIndexItem {
  return {
    icon: workspaceArea.icon,
    id: workspaceArea.id,
    name: workspaceArea.name,
    slug: workspaceArea.slug,
  };
}

function toWorkspaceDocItem(doc: WorkspaceDocListItem): AppSidebarWorkspaceDocItem {
  return {
    createdAt: doc.createdAt.toISOString(),
    docType: doc.docType,
    id: doc.id,
    isFavorite: doc.isFavorite,
    metadata: doc.metadata,
    parentDocId: doc.parentDocId,
    position: doc.position,
    slug: doc.slug,
    status: doc.status,
    tags: doc.tags,
    title: doc.title,
    updatedAt: doc.updatedAt.toISOString(),
    workspaceAreaId: doc.workspaceAreaId,
  };
}

export async function AppShell({
  activeVaultId = null,
  activeWorkspaceIndexId = null,
  children,
  currentPageLabel = null,
  workspaceDocSelector,
  workspaceIndexSelector,
}: AppShellProps) {
  await requirePageAccess({ returnTo: '/' });

  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const requestedVaultId = activeVaultId ?? defaultVaultId;
  const vaultResult = await getVaultByIdOrSlug(requestedVaultId)
    .then((vault) => ({ databaseUnavailable: false, vault }))
    .catch(() => ({ databaseUnavailable: true, vault: null }));
  const { vault } = vaultResult;
  const selectedVaultId = vault?.id ?? defaultVaultId;
  const vaultItems: AppSidebarVaultItem[] = [
    {
      id: selectedVaultId,
      name: vault?.name ?? 'VaultMind',
      slug: vault?.slug ?? 'vault',
    },
  ];

  const [workspaceIndexesResult, workspaceDocsResult] = await Promise.all([
    workspaceIndexSelector === undefined
      ? listWorkspaceAreas({ vaultId: selectedVaultId })
          .then((items) => ({ databaseUnavailable: false, items }))
          .catch(() => ({ databaseUnavailable: true, items: [] as WorkspaceAreaListItem[] }))
      : Promise.resolve({ databaseUnavailable: false, items: [] as WorkspaceAreaListItem[] }),
    workspaceDocSelector === undefined
      ? listWorkspaceDocs({ vaultId: selectedVaultId })
          .then((items) => ({ databaseUnavailable: false, items }))
          .catch(() => ({ databaseUnavailable: true, items: [] as WorkspaceDocListItem[] }))
      : Promise.resolve({ databaseUnavailable: false, items: [] as WorkspaceDocListItem[] }),
  ]);
  const databaseUnavailable =
    vaultResult.databaseUnavailable ||
    workspaceIndexesResult.databaseUnavailable ||
    workspaceDocsResult.databaseUnavailable;
  const sidebarWorkspaceIndexes = workspaceIndexesResult.items;
  const sidebarWorkspaceDocs = workspaceDocsResult.items;

  const resolvedWorkspaceIndexSelector =
    workspaceIndexSelector === undefined
      ? {
          isDisabled: databaseUnavailable || sidebarWorkspaceIndexes.length === 0,
          items: sidebarWorkspaceIndexes.map(toWorkspaceIndexItem),
          selectedId: activeWorkspaceIndexId,
        }
      : workspaceIndexSelector;
  const resolvedWorkspaceDocSelector =
    workspaceDocSelector === undefined
      ? { items: sidebarWorkspaceDocs.map(toWorkspaceDocItem) }
      : workspaceDocSelector;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] lg:h-screen lg:overflow-hidden">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        href="#main-content"
      >
        {dictionary.appShell.skipToContent}
      </a>
      <AppFrame
        activeVaultId={selectedVaultId}
        activeWorkspaceIndexId={activeWorkspaceIndexId}
        currentPageLabel={currentPageLabel}
        labels={dictionary.appShell}
        locale={locale}
        vaultItems={vaultItems}
        sidebar={
          <AppSidebar
            accessLockEnabled={isLocalAccessEnabled()}
            activeVaultId={selectedVaultId}
            activeWorkspaceIndexId={activeWorkspaceIndexId}
            key="app-sidebar"
            labels={{
              appShell: dictionary.appShell,
              userMenu: dictionary.userMenu,
            }}
            locale={locale}
            vaultSelector={{
              isDisabled: true,
              items: vaultItems,
              label: 'Personal vault',
              placeholder: 'VaultMind',
              selectedId: selectedVaultId,
            }}
            workspaceDocItems={resolvedWorkspaceDocSelector?.items ?? []}
            workspaceIndexSelector={
              resolvedWorkspaceIndexSelector
                ? {
                    ...resolvedWorkspaceIndexSelector,
                    label: dictionary.chat.hub.selectLabel,
                    placeholder: dictionary.appShell.workspaceIndexSelect.empty,
                  }
                : null
            }
          />
        }
        workspaceDocItems={resolvedWorkspaceDocSelector?.items ?? []}
        workspaceIndexItems={resolvedWorkspaceIndexSelector?.items ?? []}
      >
        {children}
      </AppFrame>
    </div>
  );
}
