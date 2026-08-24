import type { Route } from 'next';
import type { WorkspaceSourceType } from '@/db/schema';

export type OAuthConnectionStatus = {
  provider: 'googleDrive' | 'notion';
  status: string;
} | null;

type ConnectionSource = {
  id: string;
  type: WorkspaceSourceType;
  updatedAt: string;
  workspaceIndexId: string;
};

export function appendIntegrationsSearchParams({
  googleDrive,
  href,
  notion,
  workspaceIndexId,
}: {
  googleDrive?: string;
  href: Route;
  notion?: string;
  workspaceIndexId?: string;
}): Route {
  const searchParams = new URLSearchParams();

  if (workspaceIndexId) {
    searchParams.set('workspaceIndexId', workspaceIndexId);
  }

  if (googleDrive) {
    searchParams.set('googleDrive', googleDrive);
  }

  if (notion) {
    searchParams.set('notion', notion);
  }

  const query = searchParams.toString();

  return query ? (`${href}?${query}` as Route) : href;
}

export function findSelectedTargetSpace<T extends { id: string }>(
  workspaceIndexes: T[],
  requestedWorkspaceIndexId?: string,
): T | undefined {
  if (!requestedWorkspaceIndexId) {
    return undefined;
  }

  return workspaceIndexes.find((workspaceIndex) => workspaceIndex.id === requestedWorkspaceIndexId);
}

export function getConnectedOAuthSourceId({
  connectionStatus,
  sources,
  workspaceIndexId,
}: {
  connectionStatus: OAuthConnectionStatus;
  sources: ConnectionSource[];
  workspaceIndexId?: string;
}): string | undefined {
  if (!connectionStatus || connectionStatus.status !== 'connected' || !workspaceIndexId) {
    return undefined;
  }

  const sourceType = connectionStatus.provider === 'googleDrive' ? 'google-drive' : 'notion';
  let latestSource: ConnectionSource | undefined;

  for (const source of sources) {
    if (source.type !== sourceType || source.workspaceIndexId !== workspaceIndexId) {
      continue;
    }

    if (!latestSource || Date.parse(source.updatedAt) > Date.parse(latestSource.updatedAt)) {
      latestSource = source;
    }
  }

  return latestSource?.id;
}
