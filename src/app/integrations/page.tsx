import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import {
  GitHubBrandIcon,
  GoogleDriveBrandIcon,
  NotionBrandIcon,
} from '@/components/integrations/brand-icons';
import {
  ConnectedSourcesPanel,
  type ConnectedSourceSnapshot,
} from '@/components/integrations/connected-sources-panel';
import { IntegrationTargetSpaceSelect } from '@/components/integrations/integration-target-space-select';
import {
  IntegrationGrid,
  type IntegrationCardItem,
} from '@/components/integrations/integration-grid';
import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Paragraph } from '@/components/ui/typography';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { getWorkspaceIndexDetail, listWorkspaceIndexes } from '@/db/queries/workspace-indexes';
import { defaultVaultId } from '@/db/schema';
import { requireVaultPageAccess } from '@/lib/access/page-access';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import {
  appendIntegrationsSearchParams,
  findSelectedTargetSpace,
  getConnectedOAuthSourceId,
  type OAuthConnectionStatus,
} from '@/lib/integration-page-state';
import { createVaultIntegrationsHref, createVaultWorkspaceIndexesHref } from '@/lib/routes';

import type { Dictionary } from '@/lib/i18n';
import type { Route } from 'next';
import type {
  WorkspaceIndexDetail,
  WorkspaceIndexListItem,
  WorkspaceSourceWithLatestSync,
} from '@/db/queries/workspace-indexes';

type IntegrationsPageProps = {
  searchParams: Promise<{
    googleDrive?: string;
    notion?: string;
    vaultId?: string;
    workspaceIndexId?: string;
  }>;
};

type RenderIntegrationsPageInput = {
  vaultId?: string | null;
  searchParams: Promise<{
    googleDrive?: string;
    notion?: string;
    vaultId?: string;
    workspaceIndexId?: string;
  }>;
};

export const dynamic = 'force-dynamic';

function getSourceCountByType(
  workspaceIndexes: WorkspaceIndexListItem[],
  sourceType: 'github' | 'google-drive' | 'notion',
): number {
  return workspaceIndexes.reduce(
    (total, workspaceIndex) => total + (workspaceIndex.sourceCountsByType[sourceType] ?? 0),
    0,
  );
}

function hasSourceResources(
  config: WorkspaceSourceWithLatestSync['config'],
): config is WorkspaceSourceWithLatestSync['config'] & { resources: unknown[] } {
  return typeof config === 'object' && config !== null && 'resources' in config
    ? Array.isArray(config.resources)
    : false;
}

function getSourceResourceCount(source: WorkspaceSourceWithLatestSync): number {
  return hasSourceResources(source.config) ? source.config.resources.length : 1;
}

function createConnectedSourceSnapshot({
  source,
  workspaceIndexName,
}: {
  source: WorkspaceSourceWithLatestSync;
  workspaceIndexName: string;
}): ConnectedSourceSnapshot {
  return {
    createdAt: source.createdAt.toISOString(),
    id: source.id,
    lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
    latestSyncStatus:
      source.latestSyncJob?.status ?? (source.lastSyncedAt ? 'completed' : 'not-synced'),
    name: source.name,
    resourceCount: getSourceResourceCount(source),
    type: source.type,
    updatedAt: source.updatedAt.toISOString(),
    workspaceIndexId: source.workspaceIndexId,
    workspaceIndexName,
  };
}

function getConnectionStatus(searchParams: {
  googleDrive?: string;
  notion?: string;
}): OAuthConnectionStatus {
  if (searchParams.notion) {
    return {
      provider: 'notion',
      status: searchParams.notion,
    };
  }

  if (searchParams.googleDrive) {
    return {
      provider: 'googleDrive',
      status: searchParams.googleDrive,
    };
  }

  return null;
}

function createGoogleDriveStartHref({
  integrationsHref,
  workspaceIndex,
}: {
  integrationsHref: Route;
  workspaceIndex: WorkspaceIndexListItem | undefined;
}): Route | undefined {
  if (!workspaceIndex) {
    return undefined;
  }

  return `/api/integrations/google-drive/start?workspaceIndexId=${workspaceIndex.id}&returnTo=${encodeURIComponent(integrationsHref)}` as Route;
}

function createNotionStartHref({
  integrationsHref,
  workspaceIndex,
}: {
  integrationsHref: Route;
  workspaceIndex: WorkspaceIndexListItem | undefined;
}): Route | undefined {
  if (!workspaceIndex) {
    return undefined;
  }

  return `/api/integrations/notion/start?workspaceIndexId=${workspaceIndex.id}&returnTo=${encodeURIComponent(integrationsHref)}` as Route;
}

function getIntegrations({
  areasHref,
  githubSourceCount,
  googleDriveSourceCount,
  googleDriveStartHref,
  notionSourceCount,
  notionStartHref,
  strings,
}: {
  areasHref: Route;
  githubSourceCount: number;
  googleDriveSourceCount: number;
  googleDriveStartHref?: Route;
  notionSourceCount: number;
  notionStartHref?: Route;
  strings: Dictionary['integrations'];
}): IntegrationCardItem[] {
  const githubStatus = githubSourceCount > 0 ? 'connected' : 'available';
  const googleDriveStatus = googleDriveSourceCount > 0 ? 'connected' : 'available';
  const notionStatus = notionSourceCount > 0 ? 'connected' : 'available';

  return [
    {
      actionHref: areasHref,
      description: strings.githubDescription,
      icon: GitHubBrandIcon,
      id: 'github',
      status: githubStatus,
      title: 'GitHub',
    },
    {
      description: strings.connectorDescriptions.notion,
      icon: NotionBrandIcon,
      id: 'notion',
      status: notionStartHref ? notionStatus : 'unconfigured',
      title: 'Notion',
      ...(notionStartHref
        ? {
            actionHref: notionStartHref,
            actionLabel:
              notionSourceCount > 0 ? `${strings.reconnect} Notion` : `${strings.connect} Notion`,
          }
        : {}),
    },
    {
      description: strings.connectorDescriptions.googleDrive,
      icon: GoogleDriveBrandIcon,
      id: 'google-drive',
      status: googleDriveStartHref ? googleDriveStatus : 'unconfigured',
      title: 'Google Drive',
      ...(googleDriveStartHref
        ? {
            actionHref: googleDriveStartHref,
            actionLabel:
              googleDriveSourceCount > 0
                ? `${strings.reconnect} Google Drive`
                : `${strings.connect} Google Drive`,
          }
        : {}),
    },
  ];
}

export async function renderIntegrationsPage({
  searchParams,
  vaultId: routeVaultId = null,
}: RenderIntegrationsPageInput) {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const resolvedSearchParams = await searchParams;
  const vault = await getVaultByIdOrSlug(
    routeVaultId ?? resolvedSearchParams.vaultId ?? defaultVaultId,
  );

  if (routeVaultId && !vault) {
    notFound();
  }

  const vaultId = vault?.id ?? defaultVaultId;
  const vaultSlug = vault?.slug ?? null;
  const integrationsHref = createVaultIntegrationsHref({
    vaultId,
    vaultSlug,
  });

  await requireVaultPageAccess({
    returnTo: integrationsHref,
    vaultId,
  });

  const areasHref = createVaultWorkspaceIndexesHref({
    vaultId,
    vaultSlug,
  });
  let databaseUnavailable = false;
  let workspaceIndexDetails: WorkspaceIndexDetail[] = [];
  let workspaceIndexes: WorkspaceIndexListItem[] = [];

  try {
    workspaceIndexes = await listWorkspaceIndexes({ vaultId });
    workspaceIndexDetails = (
      await Promise.all(
        workspaceIndexes.map((workspaceIndex) => getWorkspaceIndexDetail(workspaceIndex.id)),
      )
    ).filter((detail): detail is WorkspaceIndexDetail => Boolean(detail));
  } catch {
    databaseUnavailable = true;
  }

  const selectedWorkspaceIndex = findSelectedTargetSpace(
    workspaceIndexes,
    resolvedSearchParams.workspaceIndexId,
  );
  const selectedIntegrationsHref = appendIntegrationsSearchParams({
    href: integrationsHref,
    ...(selectedWorkspaceIndex ? { workspaceIndexId: selectedWorkspaceIndex.id } : {}),
  });
  const targetSourceCounts = selectedWorkspaceIndex?.sourceCountsByType;
  const targetGitHubSourceCount = targetSourceCounts?.github ?? 0;
  const targetGoogleDriveSourceCount = targetSourceCounts?.['google-drive'] ?? 0;
  const targetNotionSourceCount = targetSourceCounts?.notion ?? 0;
  const githubSourceCount = getSourceCountByType(workspaceIndexes, 'github');
  const googleDriveSourceCount = getSourceCountByType(workspaceIndexes, 'google-drive');
  const notionSourceCount = getSourceCountByType(workspaceIndexes, 'notion');
  const totalSourceCount = workspaceIndexes.reduce(
    (total, workspaceIndex) => total + workspaceIndex.sourceCount,
    0,
  );
  const googleDriveStartHref = createGoogleDriveStartHref({
    integrationsHref: selectedIntegrationsHref,
    workspaceIndex: selectedWorkspaceIndex,
  });
  const notionStartHref = createNotionStartHref({
    integrationsHref: selectedIntegrationsHref,
    workspaceIndex: selectedWorkspaceIndex,
  });
  const integrationsInput = {
    areasHref,
    githubSourceCount: targetGitHubSourceCount,
    googleDriveSourceCount: targetGoogleDriveSourceCount,
    notionSourceCount: targetNotionSourceCount,
    strings: dictionary.integrations,
    ...(googleDriveStartHref ? { googleDriveStartHref } : {}),
    ...(notionStartHref ? { notionStartHref } : {}),
  };
  const integrations = getIntegrations(integrationsInput);
  const connectedSources = workspaceIndexDetails.flatMap((detail) =>
    detail.sources.map((source) =>
      createConnectedSourceSnapshot({
        source,
        workspaceIndexName: detail.workspaceIndex.name,
      }),
    ),
  );
  const connectionStatus = getConnectionStatus(resolvedSearchParams);
  const connectedOAuthSourceId = getConnectedOAuthSourceId({
    connectionStatus,
    sources: connectedSources,
    ...(selectedWorkspaceIndex ? { workspaceIndexId: selectedWorkspaceIndex.id } : {}),
  });
  const connectedIntegrationCount =
    (githubSourceCount > 0 ? 1 : 0) +
    (googleDriveSourceCount > 0 ? 1 : 0) +
    (notionSourceCount > 0 ? 1 : 0);

  return (
    <AppShell activeVaultId={vaultId}>
      <PageHeader
        actions={
          databaseUnavailable ? null : (
            <Button asChild>
              <Link href={areasHref}>{dictionary.integrations.manage}</Link>
            </Button>
          )
        }
        description={dictionary.integrations.description}
        eyebrow={dictionary.integrations.eyebrow}
        title={dictionary.integrations.title}
      />

      {databaseUnavailable ? (
        <Alert className="mt-8" variant="warning">
          <AlertDescription>{dictionary.chat.hub.databaseOverlay.description}</AlertDescription>
        </Alert>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <MetricCard
          className="p-5"
          description={dictionary.integrations.summaryConnected}
          value={connectedIntegrationCount}
          valueSize="large"
        />
        <MetricCard
          className="p-5"
          description={dictionary.integrations.summarySources}
          value={totalSourceCount}
          valueSize="large"
        />
      </section>

      {databaseUnavailable ? null : (
        <>
          <IntegrationTargetSpaceSelect
            integrationsHref={integrationsHref}
            label={dictionary.appShell.workspaceSwitcher.areaLabel}
            placeholder={dictionary.appShell.workspaceIndexSelect.empty}
            workspaceIndexes={workspaceIndexes}
            {...(selectedWorkspaceIndex
              ? { selectedWorkspaceIndexId: selectedWorkspaceIndex.id }
              : {})}
          />

          <ConnectedSourcesPanel
            initialSources={connectedSources}
            locale={locale}
            sourceStrings={dictionary.source}
            strings={dictionary.integrations.sourceManagement}
            {...(connectedOAuthSourceId ? { connectedOAuthSourceId } : {})}
            {...(connectionStatus ? { connectionStatus } : {})}
          />

          <Paragraph className="mt-6 max-w-3xl">
            {dictionary.integrations.disabledDescription}
          </Paragraph>

          {selectedWorkspaceIndex ? (
            <IntegrationGrid integrations={integrations} strings={dictionary.integrations} />
          ) : (
            <Alert className="mt-6" variant="warning">
              <AlertDescription>
                {workspaceIndexes.length === 0
                  ? dictionary.chat.hub.noWorkspaceIndexes.description
                  : dictionary.appShell.workspaceIndexSelect.empty}
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </AppShell>
  );
}

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
  const resolvedSearchParams = await searchParams;
  const vault = await getVaultByIdOrSlug(resolvedSearchParams.vaultId ?? defaultVaultId);
  const integrationsHref = createVaultIntegrationsHref({
    vaultId: vault?.id ?? defaultVaultId,
    vaultSlug: vault?.slug,
  });

  redirect(
    appendIntegrationsSearchParams({
      href: integrationsHref,
      ...(resolvedSearchParams.googleDrive
        ? { googleDrive: resolvedSearchParams.googleDrive }
        : {}),
      ...(resolvedSearchParams.notion ? { notion: resolvedSearchParams.notion } : {}),
      ...(resolvedSearchParams.workspaceIndexId
        ? { workspaceIndexId: resolvedSearchParams.workspaceIndexId }
        : {}),
    }),
  );
}
