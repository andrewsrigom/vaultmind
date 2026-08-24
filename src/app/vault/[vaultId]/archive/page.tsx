import { notFound } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { DatabaseUnavailableState } from '@/components/database-unavailable-state';
import { ArchivedDocsList, type ArchivedDocListItem } from '@/components/docs/archived-docs-list';
import { PageHeader } from '@/components/page-header';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { listWorkspaceAreas } from '@/db/queries/workspace-areas';
import { listArchivedWorkspaceDocs } from '@/db/queries/workspace-docs';
import { requireVaultPageAccess } from '@/lib/access/page-access';
import { formatDateTime } from '@/lib/date-format';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { createVaultArchiveHref } from '@/lib/routes';

type VaultArchivePageProps = {
  params: Promise<{
    vaultId: string;
  }>;
};

export const dynamic = 'force-dynamic';

export default async function VaultArchivePage({ params }: VaultArchivePageProps) {
  const { vaultId: vaultIdentifier } = await params;
  const vault = await getVaultByIdOrSlug(vaultIdentifier);

  if (!vault) {
    notFound();
  }

  await requireVaultPageAccess({
    returnTo: createVaultArchiveHref({
      vaultId: vault.id,
      vaultSlug: vault.slug,
    }),
    vaultId: vault.id,
  });

  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  let archivedDocs: ArchivedDocListItem[] = [];
  let databaseUnavailable = false;

  try {
    const [docs, spaces] = await Promise.all([
      listArchivedWorkspaceDocs({ vaultId: vault.id }),
      listWorkspaceAreas({ vaultId: vault.id }),
    ]);
    const spaceNamesById = new Map(spaces.map((space) => [space.id, space.name]));

    archivedDocs = docs.map((doc) => ({
      archivedAt: doc.archivedAt ? formatDateTime(doc.archivedAt, locale) : '',
      id: doc.id,
      slug: doc.slug,
      spaceName: spaceNamesById.get(doc.workspaceAreaId) ?? dictionary.workspaceDocs.spaceLabel,
      title: doc.title,
    }));
  } catch {
    databaseUnavailable = true;
  }

  return (
    <AppShell activeVaultId={vault.id} currentPageLabel={dictionary.appShell.nav.archive}>
      <PageHeader
        description={dictionary.workspaceDocs.archivePage.description}
        title={dictionary.workspaceDocs.archivePage.title}
      />

      {databaseUnavailable ? (
        <DatabaseUnavailableState
          className="mt-8"
          description={dictionary.chat.hub.databaseOverlay.description}
          title={dictionary.chat.hub.databaseOverlay.title}
        />
      ) : (
        <div className="mt-8">
          <ArchivedDocsList
            docs={archivedDocs}
            vaultId={vault.id}
            vaultSlug={vault.slug}
            strings={dictionary.workspaceDocs.archivePage}
          />
        </div>
      )}
    </AppShell>
  );
}
