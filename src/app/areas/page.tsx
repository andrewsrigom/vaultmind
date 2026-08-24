import { Database } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { AreaList } from '@/components/areas/area-list';
import { DatabaseUnavailableState } from '@/components/database-unavailable-state';
import { PageHeader } from '@/components/page-header';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { listWorkspaceAreas } from '@/db/queries/workspace-areas';
import { defaultVaultId } from '@/db/schema';
import { requireVaultPageAccess } from '@/lib/access/page-access';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { createVaultIntegrationsHref, createVaultWorkspaceIndexesHref } from '@/lib/routes';

import type { WorkspaceAreaListItem } from '@/db/queries/workspace-areas';

export const dynamic = 'force-dynamic';

type WorkspaceIndexesPageProps = {
  searchParams: Promise<{
    vaultId?: string;
  }>;
};

type RenderWorkspaceIndexesPageInput = {
  vaultId?: string | null;
  searchParams: Promise<{
    vaultId?: string;
  }>;
};

export async function renderWorkspaceIndexesPage({
  searchParams,
  vaultId: routeVaultId = null,
}: RenderWorkspaceIndexesPageInput) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const resolvedSearchParams = await searchParams;
  const vaultIdentifier = routeVaultId ?? resolvedSearchParams.vaultId ?? defaultVaultId;
  let databaseUnavailable = false;
  let vault: Awaited<ReturnType<typeof getVaultByIdOrSlug>> = null;
  let workspaceAreas: WorkspaceAreaListItem[] = [];

  try {
    vault = await getVaultByIdOrSlug(vaultIdentifier);
  } catch {
    databaseUnavailable = true;
  }

  if (!databaseUnavailable && routeVaultId && !vault) {
    notFound();
  }

  const vaultId = vault?.id ?? defaultVaultId;
  const vaultSlug = vault?.slug ?? null;
  const workspaceIndexesHref = createVaultWorkspaceIndexesHref({
    vaultId,
    vaultSlug,
  });
  const integrationsHref = createVaultIntegrationsHref({
    vaultId,
    vaultSlug,
  });

  if (!databaseUnavailable) {
    await requireVaultPageAccess({
      returnTo: workspaceIndexesHref,
      vaultId,
    });
  }

  try {
    workspaceAreas = vault ? await listWorkspaceAreas({ vaultId }) : [];
  } catch {
    databaseUnavailable = true;
  }

  return (
    <AppShell activeVaultId={vaultId}>
      <PageHeader
        description={dictionary.workspaceIndexes.headerDescription}
        eyebrow={dictionary.workspaceIndexes.headerEyebrow}
        title={dictionary.workspaceIndexes.title}
      />
      {databaseUnavailable ? (
        <DatabaseUnavailableState
          className="mt-8"
          description={dictionary.chat.hub.databaseOverlay.description}
          steps={dictionary.chat.hub.databaseOverlay.steps}
          title={dictionary.chat.hub.databaseOverlay.title}
        />
      ) : workspaceAreas.length > 0 ? (
        <AreaList
          areas={workspaceAreas.map((workspaceArea) => ({
            description: workspaceArea.description,
            icon: workspaceArea.icon,
            id: workspaceArea.id,
            name: workspaceArea.name,
            slug: workspaceArea.slug,
          }))}
          vaultId={vaultId}
          vaultSlug={vaultSlug}
          strings={{
            ...dictionary.workspaceIndexes,
            common: dictionary.common,
          }}
        />
      ) : (
        <div className="mt-8">
          <EmptyState
            actionHref={integrationsHref}
            actionLabel={dictionary.integrations.cta}
            description={dictionary.workspaceIndexes.emptyDescription}
            icon={Database}
            title={dictionary.workspaceIndexes.emptyTitle}
          />
        </div>
      )}
    </AppShell>
  );
}

export default async function WorkspaceIndexesPage({ searchParams }: WorkspaceIndexesPageProps) {
  const resolvedSearchParams = await searchParams;
  const vault = await getVaultByIdOrSlug(resolvedSearchParams.vaultId ?? defaultVaultId);

  redirect(
    createVaultWorkspaceIndexesHref({
      vaultId: vault?.id ?? defaultVaultId,
      vaultSlug: vault?.slug,
    }),
  );
}
