import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { AppShell } from '@/components/app-shell';
import { DatabaseUnavailableState } from '@/components/database-unavailable-state';
import { WorkspaceDocEditor } from '@/components/docs/workspace-doc-editor';
import { getWorkspaceDoc, listWorkspaceDocChildren } from '@/db/queries/workspace-docs';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { requireVaultPageAccess } from '@/lib/access/page-access';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { createVaultDocHref } from '@/lib/routes';

type VaultWorkspaceDocPageProps = {
  params: Promise<{
    docPath: string[];
    vaultId: string;
  }>;
};

export const dynamic = 'force-dynamic';

const routeParamsSchema = z.object({
  docPath: z.array(z.string().min(1)).min(1).max(2),
  vaultId: z.string().min(1),
});
const docIdSchema = z.uuid();

export default async function VaultWorkspaceDocPage({ params }: VaultWorkspaceDocPageProps) {
  const parsedParams = routeParamsSchema.safeParse(await params);

  if (!parsedParams.success) {
    notFound();
  }

  const { docPath, vaultId } = parsedParams.data;
  const docId = docPath.at(-1);
  const docSlug = docPath.length === 2 ? docPath[0] : null;
  const parsedDocId = docIdSchema.safeParse(docId);

  if (!parsedDocId.success) {
    notFound();
  }

  const vault = await getVaultByIdOrSlug(vaultId);

  if (!vault) {
    notFound();
  }

  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const resolvedVaultId = vault.id;
  const vaultSlug = vault.slug;
  await requireVaultPageAccess({
    returnTo: createVaultDocHref({
      docId: parsedDocId.data,
      docSlug,
      vaultId: resolvedVaultId,
      vaultSlug,
    }),
    vaultId: resolvedVaultId,
  });
  const canManageDocs = true;

  let databaseUnavailable = false;
  let doc: Awaited<ReturnType<typeof getWorkspaceDoc>> = null;
  let subpathDocs: Awaited<ReturnType<typeof listWorkspaceDocChildren>> = [];

  try {
    doc = await getWorkspaceDoc({
      docId: parsedDocId.data,
      includeArchived: true,
      vaultId: resolvedVaultId,
    });

    if (doc) {
      subpathDocs = await listWorkspaceDocChildren({
        docId: doc.id,
        vaultId: resolvedVaultId,
      });
    }
  } catch {
    databaseUnavailable = true;
  }

  if (databaseUnavailable) {
    return (
      <AppShell activeVaultId={resolvedVaultId} activeWorkspaceIndexId={null}>
        <DatabaseUnavailableState
          description={dictionary.chat.hub.databaseOverlay.description}
          headingLevel={1}
          title={dictionary.chat.hub.databaseOverlay.title}
        />
      </AppShell>
    );
  }

  if (!doc) {
    notFound();
  }

  if (doc.slug !== docSlug) {
    redirect(
      createVaultDocHref({
        docId: doc.id,
        docSlug: doc.slug,
        vaultId: resolvedVaultId,
        vaultSlug,
      }),
    );
  }

  return (
    <AppShell
      activeVaultId={resolvedVaultId}
      activeWorkspaceIndexId={doc.workspaceAreaId}
      currentPageLabel={doc.title}
    >
      <WorkspaceDocEditor
        canEdit={canManageDocs && !doc.archivedAt}
        canRestoreArchivedDoc={canManageDocs}
        doc={doc}
        locale={locale}
        vaultSlug={vaultSlug}
        strings={dictionary.workspaceDocs}
        subpathDocs={subpathDocs.map((subpathDoc) => ({
          id: subpathDoc.id,
          slug: subpathDoc.slug,
          title: subpathDoc.title,
        }))}
      />
    </AppShell>
  );
}
