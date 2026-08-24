'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  MoreVertical,
  PlugZap,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  GitHubBrandIcon,
  GoogleDriveBrandIcon,
  NotionBrandIcon,
} from '@/components/integrations/brand-icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getWorkspaceSourceTypeLabel } from '@/lib/source-type-labels';
import { cn } from '@/lib/utils';

import type { Dictionary, Locale } from '@/lib/i18n';
import type { OAuthConnectionStatus } from '@/lib/integration-page-state';
import type { LucideIcon } from 'lucide-react';
import type { SyncJobStatus, WorkspaceSourceType } from '@/db/schema';

export type ConnectedSourceSnapshot = {
  createdAt: string;
  id: string;
  lastSyncedAt: string | null;
  latestSyncStatus: SyncJobStatus | 'not-synced';
  name: string;
  resourceCount: number;
  type: WorkspaceSourceType;
  updatedAt: string;
  workspaceIndexId: string;
  workspaceIndexName: string;
};

type SyncSummary = {
  chunksCreated: number;
  documentsCreated: number;
  documentsDeleted: number;
  documentsFound: number;
  documentsUpdated: number;
  skippedUnchanged: number;
};

type SyncApiResponse =
  | {
      ok: true;
      summary: SyncSummary;
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

type SourceTestApiResponse =
  | {
      ok: true;
      resourceCount: number;
      source: {
        id: string;
        name: string;
        type: WorkspaceSourceType;
      };
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

type SourceDeleteApiResponse =
  | {
      ok: true;
      source: {
        id: string;
        name: string;
        type: WorkspaceSourceType;
      };
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

type ConnectedSourcesPanelProps = {
  connectedOAuthSourceId?: string;
  connectionStatus?: OAuthConnectionStatus;
  initialSources: ConnectedSourceSnapshot[];
  locale: Locale;
  sourceStrings: Dictionary['source'];
  strings: Dictionary['integrations']['sourceManagement'];
};

type SourceAction = 'remove' | 'sync' | 'test';

const syncableSourceTypes = ['github', 'google-drive', 'notion'] as const;
const oauthReconnectSourceTypes = ['google-drive', 'notion'] as const;

function getSourceTypeIcon(sourceType: WorkspaceSourceType): LucideIcon {
  if (sourceType === 'github') {
    return GitHubBrandIcon;
  }

  if (sourceType === 'google-drive') {
    return GoogleDriveBrandIcon;
  }

  if (sourceType === 'notion') {
    return NotionBrandIcon;
  }

  return FileText;
}

function isSyncableSourceType(sourceType: WorkspaceSourceType): boolean {
  return syncableSourceTypes.includes(sourceType as (typeof syncableSourceTypes)[number]);
}

function isOAuthReconnectSourceType(sourceType: WorkspaceSourceType): boolean {
  return oauthReconnectSourceTypes.includes(
    sourceType as (typeof oauthReconnectSourceTypes)[number],
  );
}

function createOAuthReconnectHref({
  pathname,
  source,
}: {
  pathname: string;
  source: ConnectedSourceSnapshot;
}): string | null {
  if (!isOAuthReconnectSourceType(source.type)) {
    return null;
  }

  const providerPath = source.type === 'google-drive' ? 'google-drive' : 'notion';
  const searchParams = new URLSearchParams({
    returnTo: pathname,
    workspaceIndexId: source.workspaceIndexId,
  });

  return `/api/integrations/${providerPath}/start?${searchParams.toString()}`;
}

function getStatusVariant(status: ConnectedSourceSnapshot['latestSyncStatus']) {
  if (status === 'completed') {
    return 'success';
  }

  if (status === 'failed') {
    return 'destructive';
  }

  if (status === 'running') {
    return 'default';
  }

  return 'muted';
}

function getStatusIcon(status: ConnectedSourceSnapshot['latestSyncStatus']) {
  if (status === 'completed') {
    return <CheckCircle2 aria-hidden="true" className="size-3.5" />;
  }

  if (status === 'failed') {
    return <AlertCircle aria-hidden="true" className="size-3.5" />;
  }

  if (status === 'running') {
    return <Spinner aria-hidden="true" className="size-3.5" />;
  }

  return <Clock3 aria-hidden="true" className="size-3.5" />;
}

function getStatusLabel({
  sourceStrings,
  status,
}: {
  sourceStrings: Dictionary['source'];
  status: ConnectedSourceSnapshot['latestSyncStatus'];
}): string {
  if (status === 'not-synced') {
    return sourceStrings.syncJob.statusValues.notSynced;
  }

  return sourceStrings.syncJob.statusValues[status];
}

function formatDateTime(value: string | null, locale: Locale, fallback: string): string {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatResourceCount(count: number, strings: ConnectedSourcesPanelProps['strings']) {
  return count === 1
    ? strings.resourceCountSingular
    : strings.resourceCount.replace('{count}', String(count));
}

function formatSyncSummary(
  summary: SyncSummary,
  strings: ConnectedSourcesPanelProps['strings'],
): string {
  return strings.syncSuccess
    .replace('{found}', String(summary.documentsFound))
    .replace('{created}', String(summary.documentsCreated))
    .replace('{updated}', String(summary.documentsUpdated))
    .replace('{unchanged}', String(summary.skippedUnchanged));
}

export function ConnectedSourcesPanel({
  connectedOAuthSourceId,
  connectionStatus = null,
  initialSources,
  locale,
  sourceStrings,
  strings,
}: ConnectedSourcesPanelProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const connectionStatusHandledRef = useRef(false);
  const [busyAction, setBusyAction] = useState<SourceAction | null>(null);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [sourcePendingRemoval, setSourcePendingRemoval] = useState<ConnectedSourceSnapshot | null>(
    null,
  );
  const [removedSourceIds, setRemovedSourceIds] = useState<string[]>([]);
  const sources = useMemo(
    () => initialSources.filter((source) => !removedSourceIds.includes(source.id)),
    [initialSources, removedSourceIds],
  );
  const connectedOAuthSource = connectedOAuthSourceId
    ? sources.find((source) => source.id === connectedOAuthSourceId)
    : undefined;
  const isConnectedOAuthSourceSyncing =
    busyAction === 'sync' && busySourceId === connectedOAuthSource?.id;

  const clearConnectionSearchParams = useCallback(() => {
    const nextSearchParams = new URLSearchParams(searchParamsString);

    nextSearchParams.delete('googleDrive');
    nextSearchParams.delete('notion');

    const nextQuery = nextSearchParams.toString();

    window.history.replaceState(null, '', nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, searchParamsString]);

  async function syncSource(sourceId: string) {
    const source = sources.find((item) => item.id === sourceId);

    if (!source) {
      toast.error(strings.syncErrorFallback);
      return;
    }

    const toastId = toast.loading(strings.syncStarted, {
      description: source.name,
    });

    setBusyAction('sync');
    setBusySourceId(sourceId);

    try {
      const response = await fetch(`/api/workspace-indexes/${source.workspaceIndexId}/sync`, {
        body: JSON.stringify({ sourceId }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as SyncApiResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      toast.success(formatSyncSummary(payload.summary, strings), {
        id: toastId,
      });
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : strings.syncErrorFallback, {
        id: toastId,
      });
    } finally {
      setBusyAction(null);
      setBusySourceId(null);
    }
  }

  useEffect(() => {
    if (!connectionStatus || connectionStatusHandledRef.current) {
      return;
    }

    connectionStatusHandledRef.current = true;
    clearConnectionSearchParams();

    if (connectionStatus.status !== 'connected') {
      if (connectionStatus.status !== 'cancelled') {
        toast.error(strings.connectionFailed);
      }

      return;
    }

    toast.success(strings.connectedToast);
  }, [clearConnectionSearchParams, connectionStatus, strings]);

  async function testSource(source: ConnectedSourceSnapshot) {
    setBusyAction('test');
    setBusySourceId(source.id);

    try {
      const response = await fetch(
        `/api/workspace-indexes/${source.workspaceIndexId}/sources/${source.id}/test`,
        {
          method: 'POST',
        },
      );
      const payload = (await response.json()) as SourceTestApiResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      toast.success(strings.testSuccess.replace('{count}', String(payload.resourceCount)));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : strings.testErrorFallback);
    } finally {
      setBusyAction(null);
      setBusySourceId(null);
    }
  }

  async function removeSource(source: ConnectedSourceSnapshot) {
    setBusyAction('remove');
    setBusySourceId(source.id);

    try {
      const response = await fetch(
        `/api/workspace-indexes/${source.workspaceIndexId}/sources/${source.id}`,
        {
          method: 'DELETE',
        },
      );
      const payload = (await response.json()) as SourceDeleteApiResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      setRemovedSourceIds((currentSourceIds) =>
        currentSourceIds.includes(source.id) ? currentSourceIds : [...currentSourceIds, source.id],
      );
      setSourcePendingRemoval(null);
      toast.success(strings.removeSuccess);
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : strings.removeErrorFallback);
    } finally {
      setBusyAction(null);
      setBusySourceId(null);
    }
  }

  return (
    <section aria-labelledby="connected-sources-heading" className="mt-8">
      {connectedOAuthSource ? (
        <Alert className="mb-4" variant="success">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          <AlertTitle>{strings.connectedToast}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0">
              <span className="font-medium">{connectedOAuthSource.name}</span>
              <span className="text-[var(--muted-foreground)]">
                {' · '}
                {strings.table.space}: {connectedOAuthSource.workspaceIndexName}
              </span>
            </p>
            <Button
              className="w-full shrink-0 sm:w-auto"
              disabled={busySourceId !== null}
              onClick={() => {
                void syncSource(connectedOAuthSource.id);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {isConnectedOAuthSourceSyncing ? <Spinner aria-hidden="true" /> : <RefreshCw />}
              {isConnectedOAuthSourceSyncing ? strings.syncing : strings.syncNow}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              className="text-lg font-semibold tracking-normal text-[var(--foreground)]"
              id="connected-sources-heading"
            >
              {strings.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
              {strings.description}
            </p>
          </div>
          <Badge className="w-fit" variant="muted">
            {strings.sourceCount.replace('{count}', String(sources.length))}
          </Badge>
        </div>

        {sources.length === 0 ? (
          <div className="grid min-h-48 place-items-center px-5 py-10 text-center">
            <div className="max-w-md">
              <PlugZap
                aria-hidden="true"
                className="mx-auto size-8 text-[var(--muted-foreground)]"
              />
              <h3 className="mt-4 text-base font-semibold text-[var(--foreground)]">
                {strings.emptyTitle}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {strings.emptyDescription}
              </p>
            </div>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-64 pl-5">{strings.table.source}</TableHead>
                  <TableHead>{strings.table.space}</TableHead>
                  <TableHead>{strings.table.scope}</TableHead>
                  <TableHead>{strings.table.lastSynced}</TableHead>
                  <TableHead>{strings.table.status}</TableHead>
                  <TableHead className="w-14 pr-5 text-right">{strings.table.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => {
                  const SourceIcon = getSourceTypeIcon(source.type);
                  const isBusy = busySourceId === source.id;
                  const reconnectHref = createOAuthReconnectHref({ pathname, source });
                  const isSyncable = isSyncableSourceType(source.type);

                  return (
                    <TableRow key={source.id}>
                      <TableCell className="pl-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--background)]">
                            <SourceIcon aria-hidden="true" className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[var(--foreground)]">
                              {source.name}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                              {getWorkspaceSourceTypeLabel(source.type)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="line-clamp-1 text-sm">{source.workspaceIndexName}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {formatResourceCount(source.resourceCount, strings)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[var(--muted-foreground)]">
                        {formatDateTime(source.lastSyncedAt, locale, strings.notSynced)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn('gap-1.5', source.latestSyncStatus === 'running' && 'pr-3')}
                          variant={getStatusVariant(source.latestSyncStatus)}
                        >
                          {getStatusIcon(source.latestSyncStatus)}
                          {getStatusLabel({
                            sourceStrings,
                            status: source.latestSyncStatus,
                          })}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label={strings.actionsLabel.replace('{name}', source.name)}
                              disabled={isBusy}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              {isBusy ? (
                                <Spinner aria-hidden="true" />
                              ) : (
                                <MoreVertical aria-hidden="true" className="size-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-56">
                            <DropdownMenuLabel>{source.name}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {reconnectHref ? (
                              <DropdownMenuItem
                                disabled={isBusy}
                                onSelect={() => {
                                  window.location.assign(reconnectHref);
                                }}
                              >
                                <RefreshCw aria-hidden="true" />
                                {strings.updateAccess}
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              disabled={!isSyncable || isBusy}
                              onSelect={() => {
                                void syncSource(source.id);
                              }}
                            >
                              <RefreshCw aria-hidden="true" />
                              {isBusy && busyAction === 'sync' ? strings.syncing : strings.syncNow}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!isSyncable || isBusy}
                              onSelect={() => {
                                void testSource(source);
                              }}
                            >
                              <PlugZap aria-hidden="true" />
                              {isBusy && busyAction === 'test'
                                ? strings.testing
                                : strings.testConnection}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-[var(--danger-foreground)] focus:text-[var(--danger-foreground)]"
                              disabled={isBusy}
                              onSelect={() => {
                                setSourcePendingRemoval(source);
                              }}
                            >
                              <Trash2 aria-hidden="true" />
                              {strings.removeConnection}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="border-t border-[var(--border)] px-5 py-3 text-xs leading-5 text-[var(--muted-foreground)]">
              {strings.singleConnectionNote}
            </div>
          </>
        )}
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setSourcePendingRemoval(null);
          }
        }}
        open={Boolean(sourcePendingRemoval)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.removeDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.removeDialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--danger)] text-white hover:brightness-95"
              disabled={busyAction === 'remove'}
              onClick={(event) => {
                event.preventDefault();

                if (sourcePendingRemoval) {
                  void removeSource(sourcePendingRemoval);
                }
              }}
            >
              {busyAction === 'remove' ? strings.removing : strings.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
