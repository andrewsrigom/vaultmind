import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { AppShell } from '@/components/app-shell';
import { DatabaseUnavailableState } from '@/components/database-unavailable-state';
import {
  getOrCreateWorkspaceAreaHomeDoc,
  getWorkspaceAreaHomeDoc,
} from '@/db/queries/workspace-docs';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { getWorkspaceAreaByIdOrSlug } from '@/db/queries/workspace-areas';
import { requireVaultPageAccess } from '@/lib/access/page-access';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { createVaultAreaHref, createVaultDocHref } from '@/lib/routes';

type VaultAreaDetailPageProps = {
  params: Promise<{
    areaId: string;
    vaultId: string;
  }>;
};

export const dynamic = 'force-dynamic';

const routeParamsSchema = z.object({
  areaId: z.string().min(1),
  vaultId: z.string().min(1),
});

export default async function VaultAreaDetailPage({ params }: VaultAreaDetailPageProps) {
  const parsedParams = routeParamsSchema.safeParse(await params);

  if (!parsedParams.success) {
    notFound();
  }

  const { areaId, vaultId } = parsedParams.data;
  const vault = await getVaultByIdOrSlug(vaultId);

  if (!vault) {
    notFound();
  }

  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const resolvedVaultId = vault.id;
  const vaultSlug = vault.slug;
  await requireVaultPageAccess({
    returnTo: createVaultAreaHref({
      areaId,
      vaultId: resolvedVaultId,
      vaultSlug,
    }),
    vaultId: resolvedVaultId,
  });

  let area: Awaited<ReturnType<typeof getWorkspaceAreaByIdOrSlug>> = null;
  let homeDoc: Awaited<ReturnType<typeof getWorkspaceAreaHomeDoc>> = null;
  let databaseUnavailable = false;

  try {
    area = await getWorkspaceAreaByIdOrSlug({
      vaultId: resolvedVaultId,
      workspaceAreaIdentifier: areaId,
    });

    if (area) {
      homeDoc =
        (await getWorkspaceAreaHomeDoc({
          vaultId: resolvedVaultId,
          workspaceAreaId: area.id,
        })) ??
        (await getOrCreateWorkspaceAreaHomeDoc({
          vaultId: resolvedVaultId,
          workspaceAreaId: area.id,
        }));
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
          steps={dictionary.chat.hub.databaseOverlay.steps}
          title={dictionary.chat.hub.databaseOverlay.title}
        />
      </AppShell>
    );
  }

  if (!area || !homeDoc) {
    notFound();
  }

  redirect(
    createVaultDocHref({
      docId: homeDoc.id,
      docSlug: homeDoc.slug,
      vaultId: resolvedVaultId,
      vaultSlug,
    }),
  );
}
