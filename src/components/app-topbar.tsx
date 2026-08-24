'use client';

import {
  Archive,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  EyeOff,
  ExternalLink,
  History,
  Info,
  Link2,
  List,
  MessageCircle,
  MoreVertical,
  MoveRight,
  Paintbrush,
  Plus,
  ShieldCheck,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import {
  createVaultArchiveHref,
  createVaultDocHref,
  createWorkspaceIndexHref,
  getWorkspaceDocIdFromPath,
  getWorkspaceIndexIdFromPath,
  isAskPath,
  isArchivePath,
  isChatPath,
  isDocumentsPath,
  isIntegrationsPath,
  isSettingsPath,
  isWorkspaceIndexesPath,
  isWorkspaceDocPath,
} from '@/lib/routes';
import { cn } from '@/lib/utils';
import { updateWorkspaceDocFavorite } from '@/lib/workspace-doc-favorite';
import {
  getStoredWorkspaceDocEditorWide,
  getStoredWorkspaceDocSubpathButtonsHidden,
  setStoredWorkspaceDocEditorWide,
  setStoredWorkspaceDocSubpathButtonsHidden,
  subscribeWorkspaceDocEditorLayoutChange,
} from '@/lib/workspace-doc-editor-layout';

import type {
  AppSidebarWorkspaceDocItem,
  AppSidebarWorkspaceIndexItem,
  AppSidebarVaultItem,
} from '@/components/app-sidebar';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { Route } from 'next';
import type { JsonValue, WorkspaceDocType } from '@/db/schema';

type AppTopbarProps = {
  activeWorkspaceIndexId: string | null;
  activeVaultId: string | null;
  currentPageLabel?: string | null;
  isTableOfContentsOpen: boolean;
  onToggleTableOfContents: () => void;
  workspaceDocItems: AppSidebarWorkspaceDocItem[];
  workspaceIndexItems: AppSidebarWorkspaceIndexItem[];
  labels: Dictionary['appShell'];
  locale: Locale;
  vaultItems: AppSidebarVaultItem[];
};

type BreadcrumbItem = {
  href?: Route;
  label: string;
};

type AppNavigationHistoryState = {
  entries: string[];
  index: number;
};

const appNavigationHistoryStorageKey = 'vaultmind:app-navigation-history';
const appNavigationHistoryChangeEventName = 'vaultmind-app-navigation-history-change';
const appNavigationHistoryLimit = 50;

function createAppNavigationPath(
  pathname: string,
  searchParams: { toString: () => string },
): string {
  const search = searchParams.toString();

  return search ? `${pathname}?${search}` : pathname;
}

function parseAppNavigationHistory(storedValue: string | null): AppNavigationHistoryState | null {
  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    if (!parsedValue || typeof parsedValue !== 'object') {
      return null;
    }

    const { entries, index } = parsedValue as Partial<AppNavigationHistoryState>;

    if (
      !Array.isArray(entries) ||
      entries.some((entry) => typeof entry !== 'string') ||
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= entries.length
    ) {
      return null;
    }

    return { entries, index };
  } catch {
    return null;
  }
}

function readAppNavigationHistory(): AppNavigationHistoryState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return parseAppNavigationHistory(window.sessionStorage.getItem(appNavigationHistoryStorageKey));
}

function writeAppNavigationHistory(state: AppNavigationHistoryState) {
  window.sessionStorage.setItem(appNavigationHistoryStorageKey, JSON.stringify(state));
  window.dispatchEvent(new Event(appNavigationHistoryChangeEventName));
}

function getAppNavigationHistorySnapshot() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.sessionStorage.getItem(appNavigationHistoryStorageKey) ?? '';
}

function subscribeAppNavigationHistoryChange(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener('storage', onStoreChange);
  window.addEventListener(appNavigationHistoryChangeEventName, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(appNavigationHistoryChangeEventName, onStoreChange);
  };
}

function createNextAppNavigationHistoryState(
  navigationPath: string,
  currentState: AppNavigationHistoryState | null,
): AppNavigationHistoryState {
  if (!currentState || currentState.entries.length === 0) {
    return {
      entries: [navigationPath],
      index: 0,
    };
  }

  const currentNavigationPath = currentState.entries[currentState.index];

  if (currentNavigationPath === navigationPath) {
    return currentState;
  }

  if (currentState.entries[currentState.index - 1] === navigationPath) {
    return {
      entries: currentState.entries,
      index: currentState.index - 1,
    };
  }

  if (currentState.entries[currentState.index + 1] === navigationPath) {
    return {
      entries: currentState.entries,
      index: currentState.index + 1,
    };
  }

  const entries = [...currentState.entries.slice(0, currentState.index + 1), navigationPath];
  const trimmedEntries =
    entries.length > appNavigationHistoryLimit
      ? entries.slice(entries.length - appNavigationHistoryLimit)
      : entries;

  return {
    entries: trimmedEntries,
    index: trimmedEntries.length - 1,
  };
}

function getAppNavigationHistoryAvailability(state: AppNavigationHistoryState | null) {
  return {
    canGoBack: Boolean(state && state.index > 0),
    canGoForward: Boolean(state && state.index < state.entries.length - 1),
  };
}

type DocTopbarActionsProps = {
  doc: AppSidebarWorkspaceDocItem | null;
  isTableOfContentsOpen: boolean;
  labels: Dictionary['appShell']['topbarDocActions'];
  locale: Locale;
  onToggleTableOfContents: () => void;
  vaultId: string | null;
  vaultSlug: string | null;
  pathname: string;
  workspaceDocItems: AppSidebarWorkspaceDocItem[];
  workspaceIndexItems: AppSidebarWorkspaceIndexItem[];
};

type WorkspaceDocActionDoc = {
  content: string;
  docType: WorkspaceDocType;
  id: string;
  metadata: JsonValue;
  parentDocId: string | null;
  slug: string;
  tags: string[];
  title: string;
  workspaceAreaId: string;
};

type WorkspaceDocActionResponse =
  | {
      doc: WorkspaceDocActionDoc;
      ok: true;
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

type RelativeTimeUnit = Intl.RelativeTimeFormatUnit;

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function getRelativeTimeParts(value: string): { unit: RelativeTimeUnit; value: number } {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { unit: 'minute', value: 0 };
  }

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return { unit: 'minute', value: 0 };
  }

  if (absSeconds < 3600) {
    return { unit: 'minute', value: Math.round(diffSeconds / 60) };
  }

  if (absSeconds < 86400) {
    return { unit: 'hour', value: Math.round(diffSeconds / 3600) };
  }

  if (absSeconds < 2592000) {
    return { unit: 'day', value: Math.round(diffSeconds / 86400) };
  }

  if (absSeconds < 31536000) {
    return { unit: 'month', value: Math.round(diffSeconds / 2592000) };
  }

  return { unit: 'year', value: Math.round(diffSeconds / 31536000) };
}

function formatRelativeTime(value: string, locale: Locale): string {
  const parts = getRelativeTimeParts(value);
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: 'long',
  });

  return formatter.format(parts.value, parts.unit);
}

function getRouteLabel(pathname: string, labels: Dictionary['appShell']): string {
  if (isChatPath(pathname)) {
    return labels.nav.chat;
  }

  if (isAskPath(pathname)) {
    return labels.nav.askAi;
  }

  if (isArchivePath(pathname)) {
    return labels.nav.archive;
  }

  if (isIntegrationsPath(pathname)) {
    return labels.nav.integrations;
  }

  if (isSettingsPath(pathname)) {
    return labels.nav.settings;
  }

  if (isDocumentsPath(pathname)) {
    return labels.nav.sources;
  }

  if (isWorkspaceIndexesPath(pathname)) {
    return labels.nav.workspaceIndexes;
  }

  if (pathname.endsWith('/sources') || pathname.endsWith('/documents')) {
    return labels.nav.sources;
  }

  if (getWorkspaceIndexIdFromPath(pathname)) {
    return labels.sidebarGroups.overview;
  }

  return labels.breadcrumb.current;
}

function getMarkdownFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return `${slug || 'doc'}.md`;
}

async function readDocForAction({
  docId,
  vaultId,
}: {
  docId: string;
  vaultId: string;
}): Promise<WorkspaceDocActionDoc> {
  const response = await fetch(`/api/vault/${vaultId}/docs/${docId}`);
  const payload = (await response.json()) as WorkspaceDocActionResponse;

  if (!payload.ok) {
    throw new Error(payload.error.message);
  }

  return payload.doc;
}

type MoveDestination = {
  depth: number;
  key: string;
  label: string;
  parentDocId: string | null;
  workspaceAreaId: string;
};

function collectDescendantDocIds(docs: AppSidebarWorkspaceDocItem[], docId: string): Set<string> {
  const childrenByParentDocId = new Map<string, AppSidebarWorkspaceDocItem[]>();

  for (const doc of docs) {
    if (!doc.parentDocId) {
      continue;
    }

    const children = childrenByParentDocId.get(doc.parentDocId) ?? [];
    children.push(doc);
    childrenByParentDocId.set(doc.parentDocId, children);
  }

  const descendantDocIds = new Set<string>();
  const pendingDocs = [...(childrenByParentDocId.get(docId) ?? [])];

  while (pendingDocs.length > 0) {
    const pendingDoc = pendingDocs.pop();

    if (!pendingDoc) {
      continue;
    }

    descendantDocIds.add(pendingDoc.id);
    pendingDocs.push(...(childrenByParentDocId.get(pendingDoc.id) ?? []));
  }

  return descendantDocIds;
}

function appendDocDestinations({
  depth,
  destinations,
  docs,
  excludedDocIds,
  parentDocId,
}: {
  depth: number;
  destinations: MoveDestination[];
  docs: AppSidebarWorkspaceDocItem[];
  excludedDocIds: Set<string>;
  parentDocId: string | null;
}) {
  const childDocs = docs
    .filter((doc) => doc.parentDocId === parentDocId && !excludedDocIds.has(doc.id))
    .sort((firstDoc, secondDoc) => {
      if (firstDoc.position !== secondDoc.position) {
        return firstDoc.position - secondDoc.position;
      }

      return firstDoc.title.localeCompare(secondDoc.title);
    });

  for (const childDoc of childDocs) {
    destinations.push({
      depth,
      key: `doc:${childDoc.id}`,
      label: childDoc.title,
      parentDocId: childDoc.id,
      workspaceAreaId: childDoc.workspaceAreaId,
    });
    appendDocDestinations({
      depth: depth + 1,
      destinations,
      docs,
      excludedDocIds,
      parentDocId: childDoc.id,
    });
  }
}

function getMoveDestinations({
  doc,
  workspaceDocItems,
  workspaceIndexItems,
}: {
  doc: AppSidebarWorkspaceDocItem;
  workspaceDocItems: AppSidebarWorkspaceDocItem[];
  workspaceIndexItems: AppSidebarWorkspaceIndexItem[];
}): MoveDestination[] {
  const excludedDocIds = collectDescendantDocIds(workspaceDocItems, doc.id);
  excludedDocIds.add(doc.id);

  return workspaceIndexItems
    .filter((workspaceIndex) => workspaceIndex.id !== '__all_areas__')
    .flatMap((workspaceIndex) => {
      const spaceDocs = workspaceDocItems.filter(
        (workspaceDoc) => workspaceDoc.workspaceAreaId === workspaceIndex.id,
      );
      const destinations: MoveDestination[] = [
        {
          depth: 0,
          key: `space:${workspaceIndex.id}`,
          label: workspaceIndex.name,
          parentDocId: null,
          workspaceAreaId: workspaceIndex.id,
        },
      ];

      appendDocDestinations({
        depth: 1,
        destinations,
        docs: spaceDocs,
        excludedDocIds,
        parentDocId: null,
      });

      return destinations;
    });
}

function MoveDocDialog({
  doc,
  labels,
  onMoved,
  onOpenChange,
  open,
  vaultId,
  workspaceDocItems,
  workspaceIndexItems,
}: {
  doc: AppSidebarWorkspaceDocItem | null;
  labels: Dictionary['appShell']['topbarDocActions'];
  onMoved: (doc: WorkspaceDocActionDoc) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vaultId: string | null;
  workspaceDocItems: AppSidebarWorkspaceDocItem[];
  workspaceIndexItems: AppSidebarWorkspaceIndexItem[];
}) {
  const [isMoving, setIsMoving] = useState(false);
  const [selectedDestinationKey, setSelectedDestinationKey] = useState<string | null>(null);
  const destinations = doc
    ? getMoveDestinations({
        doc,
        workspaceDocItems,
        workspaceIndexItems,
      })
    : [];
  const selectedDestination =
    destinations.find((destination) => destination.key === selectedDestinationKey) ??
    destinations[0] ??
    null;

  async function moveDoc() {
    if (!doc || !vaultId || !selectedDestination || isMoving) {
      return;
    }

    setIsMoving(true);

    try {
      const response = await fetch(`/api/vault/${vaultId}/docs/${doc.id}/move`, {
        body: JSON.stringify({
          parentDocId: selectedDestination.parentDocId,
          workspaceAreaId: selectedDestination.workspaceAreaId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const payload = (await response.json()) as WorkspaceDocActionResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      toast.success(labels.moved);
      onMoved(payload.doc);
      onOpenChange(false);
      setSelectedDestinationKey(null);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : labels.moveError);
    } finally {
      setIsMoving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{labels.moveDialogTitle}</DialogTitle>
          <DialogDescription>{labels.moveDialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--border)] p-1">
          {destinations.map((destination) => {
            const isSelected = selectedDestination?.key === destination.key;

            return (
              <button
                className={cn(
                  'flex w-full min-w-0 items-center rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                  isSelected && 'bg-[var(--muted)] text-[var(--foreground)]',
                )}
                key={destination.key}
                onClick={() => setSelectedDestinationKey(destination.key)}
                style={{ paddingLeft: `${12 + destination.depth * 18}px` }}
                type="button"
              >
                <span className="truncate">{destination.label}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {labels.cancel}
          </Button>
          <Button
            disabled={!selectedDestination || isMoving}
            onClick={() => void moveDoc()}
            type="button"
          >
            {isMoving ? labels.moving : labels.move}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocInsightAvatar({ name }: { name: string }) {
  return (
    <Avatar className="size-6 border border-[var(--border)]">
      <AvatarFallback className="bg-[var(--muted)] text-[10px] font-medium text-[var(--foreground)]">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function DocInsightsDialog({
  doc,
  labels,
  locale,
  onOpenChange,
  open,
}: {
  doc: AppSidebarWorkspaceDocItem | null;
  labels: Dictionary['appShell']['topbarDocActions'];
  locale: Locale;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const userName = labels.insightsUserFallback;
  const createdTime = doc ? formatRelativeTime(doc.createdAt, locale) : '';
  const updatedTime = doc ? formatRelativeTime(doc.updatedAt, locale) : '';
  const createdActivity = labels.insightsCreatedActivity
    .replace('{name}', userName)
    .replace('{time}', createdTime);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100vh-3rem)] max-w-5xl overflow-hidden p-0">
        <div className="grid min-h-[26rem] overflow-y-auto md:grid-cols-[minmax(0,0.62fr)_minmax(18rem,0.38fr)]">
          <section className="px-8 py-9 md:px-10">
            <DialogHeader className="mb-8 space-y-0 text-left">
              <DialogTitle className="text-2xl font-semibold tracking-normal text-[var(--foreground)]">
                {labels.insightsTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {doc?.title ?? labels.insightsTitle}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {labels.insightsInformationTitle}
              </h3>
              <dl className="grid gap-4 text-sm">
                <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-4">
                  <dt className="text-[var(--muted-foreground)]">{labels.insightsAuthor}</dt>
                  <dd>
                    <span className="sr-only">{userName}</span>
                    <DocInsightAvatar name={userName} />
                  </dd>
                </div>
                <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-4">
                  <dt className="text-[var(--muted-foreground)]">{labels.contributors}</dt>
                  <dd className="text-[var(--muted-foreground)]">{labels.noContributors}</dd>
                </div>
                <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-4">
                  <dt className="text-[var(--muted-foreground)]">{labels.insightsViewers}</dt>
                  <dd>
                    <span className="sr-only">{userName}</span>
                    <DocInsightAvatar name={userName} />
                  </dd>
                </div>
                <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-4">
                  <dt className="text-[var(--muted-foreground)]">{labels.created}</dt>
                  <dd className="text-[var(--foreground)]">{createdTime}</dd>
                </div>
                <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-4">
                  <dt className="text-[var(--muted-foreground)]">{labels.insightsLastUpdate}</dt>
                  <dd className="flex min-w-0 items-center gap-2 text-[var(--foreground)]">
                    <DocInsightAvatar name={userName} />
                    <span className="truncate">{updatedTime}</span>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <aside className="border-t border-[var(--border)] px-8 py-9 md:border-l md:border-t-0">
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {labels.insightsActivityTitle}
            </h3>
            <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
              <Plus aria-hidden="true" className="size-4 shrink-0" />
              <DocInsightAvatar name={userName} />
              <p className="min-w-0">
                <span className="text-[var(--foreground)]">{userName}</span>{' '}
                {createdActivity.replace(userName, '').trim()}
              </p>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocTopbarActions({
  doc,
  isTableOfContentsOpen,
  labels,
  locale,
  onToggleTableOfContents,
  pathname,
  vaultId,
  vaultSlug,
  workspaceDocItems,
  workspaceIndexItems,
}: DocTopbarActionsProps) {
  const router = useRouter();
  const docId = getWorkspaceDocIdFromPath(pathname);
  const [favoriteOverride, setFavoriteOverride] = useState<{
    docId: string;
    isFavorite: boolean;
  } | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isInsightsDialogOpen, setIsInsightsDialogOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);
  const isEditorWide = useSyncExternalStore(
    subscribeWorkspaceDocEditorLayoutChange,
    getStoredWorkspaceDocEditorWide,
    () => false,
  );
  const areSubpathButtonsHidden = useSyncExternalStore(
    subscribeWorkspaceDocEditorLayoutChange,
    getStoredWorkspaceDocSubpathButtonsHidden,
    () => false,
  );
  const isFavorite =
    favoriteOverride && favoriteOverride.docId === doc?.id
      ? favoriteOverride.isFavorite
      : Boolean(doc?.isFavorite);

  useEffect(() => {
    document.documentElement.dataset.workspaceDocEditorWidth = isEditorWide ? 'wide' : 'default';
    document.documentElement.dataset.workspaceDocSubpathButtons = areSubpathButtonsHidden
      ? 'hidden'
      : 'visible';

    return () => {
      delete document.documentElement.dataset.workspaceDocEditorWidth;
      delete document.documentElement.dataset.workspaceDocSubpathButtons;
    };
  }, [areSubpathButtonsHidden, isEditorWide]);

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error(labels.copyError);
    }
  }

  async function copyLink() {
    await copyText(`${window.location.origin}${pathname}`, labels.linkCopied);
  }

  async function duplicateDoc() {
    if (!docId || !vaultId || isDuplicating) {
      return;
    }

    setIsDuplicating(true);

    try {
      const sourceDoc = await readDocForAction({ docId, vaultId });
      const response = await fetch(`/api/vault/${vaultId}/docs`, {
        body: JSON.stringify({
          content: sourceDoc.content,
          docType: sourceDoc.docType,
          metadata: sourceDoc.metadata,
          parentDocId: sourceDoc.parentDocId,
          tags: sourceDoc.tags,
          title: `${sourceDoc.title} ${labels.copyTitleSuffix}`,
          workspaceAreaId: sourceDoc.workspaceAreaId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as WorkspaceDocActionResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      toast.success(labels.duplicated);
      router.push(
        createVaultDocHref({
          docId: payload.doc.id,
          docSlug: payload.doc.slug,
          vaultId,
          vaultSlug,
        }),
      );
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : labels.duplicateError);
    } finally {
      setIsDuplicating(false);
    }
  }

  async function exportMarkdown() {
    if (!docId || !vaultId || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const sourceDoc = await readDocForAction({ docId, vaultId });
      const blob = new Blob([sourceDoc.content], {
        type: 'text/markdown;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = getMarkdownFilename(sourceDoc.title);
      link.click();
      URL.revokeObjectURL(url);
      toast.success(labels.exported);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : labels.exportError);
    } finally {
      setIsExporting(false);
    }
  }

  async function toggleFavorite() {
    if (!doc || !vaultId || isUpdatingFavorite) {
      return;
    }

    const nextIsFavorite = !isFavorite;
    setFavoriteOverride({
      docId: doc.id,
      isFavorite: nextIsFavorite,
    });
    setIsUpdatingFavorite(true);

    try {
      const updatedDoc = await updateWorkspaceDocFavorite({
        docId: doc.id,
        isFavorite: nextIsFavorite,
        vaultId,
      });

      setFavoriteOverride({
        docId: updatedDoc.id,
        isFavorite: updatedDoc.isFavorite,
      });
      toast.success(updatedDoc.isFavorite ? labels.favorited : labels.unfavorited);
      router.refresh();
    } catch (error: unknown) {
      setFavoriteOverride({
        docId: doc.id,
        isFavorite: !nextIsFavorite,
      });
      toast.error(error instanceof Error ? error.message : labels.favoriteError);
    } finally {
      setIsUpdatingFavorite(false);
    }
  }

  async function archiveDoc() {
    if (!docId || !vaultId || isArchiving) {
      return;
    }

    setIsArchiving(true);

    try {
      const response = await fetch(`/api/vault/${vaultId}/docs/${docId}/archive`, {
        method: 'POST',
      });
      const payload = (await response.json()) as WorkspaceDocActionResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      toast.success(labels.archived);
      router.push(
        createVaultArchiveHref({
          vaultId,
          vaultSlug,
        }),
      );
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : labels.archiveError);
    } finally {
      setIsArchiving(false);
    }
  }

  const favoriteLabel = isFavorite ? labels.unfavorite : labels.favorite;

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <MoveDocDialog
        doc={doc}
        labels={labels}
        onMoved={(movedDoc) => {
          if (!vaultId) {
            return;
          }

          router.push(
            createVaultDocHref({
              docId: movedDoc.id,
              docSlug: movedDoc.slug,
              vaultId,
              vaultSlug,
            }),
          );
          router.refresh();
        }}
        onOpenChange={setIsMoveDialogOpen}
        open={isMoveDialogOpen}
        vaultId={vaultId}
        workspaceDocItems={workspaceDocItems}
        workspaceIndexItems={workspaceIndexItems}
      />
      <DocInsightsDialog
        doc={doc}
        labels={labels}
        locale={locale}
        onOpenChange={setIsInsightsDialogOpen}
        open={isInsightsDialogOpen}
      />
      <Button
        className="h-8 rounded-md px-3 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        onClick={() => void copyLink()}
        type="button"
        variant="ghost"
      >
        {labels.share}
      </Button>
      <Button
        aria-label={favoriteLabel}
        aria-pressed={isFavorite}
        className={cn(
          'size-8 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
          isFavorite && 'text-[var(--warning-foreground)]',
        )}
        disabled={!doc || !vaultId || isUpdatingFavorite}
        onClick={() => void toggleFavorite()}
        size="icon"
        title={favoriteLabel}
        type="button"
        variant="ghost"
      >
        <Star aria-hidden="true" className={cn('size-4', isFavorite && 'fill-current')} />
      </Button>
      <Button
        aria-label={labels.info}
        className="size-8 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        disabled={!doc}
        onClick={() => setIsInsightsDialogOpen(true)}
        size="icon"
        title={labels.info}
        type="button"
        variant="ghost"
      >
        <Info aria-hidden="true" className="size-4" />
      </Button>
      <Button
        aria-label={labels.comments}
        className="size-8 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        size="icon"
        title={labels.comments}
        type="button"
        variant="ghost"
        disabled
      >
        <MessageCircle aria-hidden="true" className="size-4" />
      </Button>
      <Button
        aria-label={labels.tableOfContents}
        aria-pressed={isTableOfContentsOpen}
        className={cn(
          'size-8 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
          isTableOfContentsOpen && 'bg-[var(--muted)] text-[var(--foreground)]',
        )}
        disabled={!docId || !vaultId}
        onClick={onToggleTableOfContents}
        size="icon"
        title={labels.tableOfContents}
        type="button"
        variant="ghost"
      >
        <List aria-hidden="true" className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={labels.more}
            className="size-8 rounded-md bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted)]"
            size="icon"
            type="button"
            variant="ghost"
          >
            <MoreVertical aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem disabled>
            <History aria-hidden="true" />
            {labels.history}
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <ShieldCheck aria-hidden="true" />
            {labels.protectEditing}
            <ChevronRight aria-hidden="true" className="ml-auto size-4" />
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Paintbrush aria-hidden="true" />
              {labels.editLayout}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setStoredWorkspaceDocEditorWide(!isEditorWide);
                }}
              >
                <ArrowLeftRight aria-hidden="true" />
                <span className="min-w-0 flex-1">{labels.makeEditorWider}</span>
                <Switch
                  aria-label={labels.makeEditorWider}
                  checked={isEditorWide}
                  onCheckedChange={setStoredWorkspaceDocEditorWide}
                  onClick={(event) => event.stopPropagation()}
                />
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setStoredWorkspaceDocSubpathButtonsHidden(!areSubpathButtonsHidden);
                }}
              >
                <EyeOff aria-hidden="true" />
                <span className="min-w-0 flex-1">{labels.hideSubpathButtons}</span>
                <Switch
                  aria-label={labels.hideSubpathButtons}
                  checked={areSubpathButtonsHidden}
                  onCheckedChange={setStoredWorkspaceDocSubpathButtonsHidden}
                  onClick={(event) => event.stopPropagation()}
                />
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              void copyLink();
            }}
          >
            <Link2 aria-hidden="true" />
            {labels.copyLink}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={pathname as Route} target="_blank">
              <ExternalLink aria-hidden="true" />
              {labels.openInNewTab}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!docId || !vaultId || isExporting}
            onSelect={(event) => {
              event.preventDefault();
              void exportMarkdown();
            }}
          >
            <Download aria-hidden="true" />
            {labels.export}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!docId || !vaultId || isDuplicating}
            onSelect={(event) => {
              event.preventDefault();
              void duplicateDoc();
            }}
          >
            <Copy aria-hidden="true" />
            {labels.duplicate}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!doc || !vaultId}
            onSelect={(event) => {
              event.preventDefault();
              setIsMoveDialogOpen(true);
            }}
          >
            <MoveRight aria-hidden="true" />
            {labels.moveTo}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!docId || !vaultId || isArchiving}
            onSelect={(event) => {
              event.preventDefault();
              void archiveDoc();
            }}
          >
            <Archive aria-hidden="true" />
            {labels.archive}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppTopbar({
  activeVaultId,
  activeWorkspaceIndexId,
  currentPageLabel = null,
  isTableOfContentsOpen,
  labels,
  locale,
  onToggleTableOfContents,
  vaultItems,
  workspaceDocItems,
  workspaceIndexItems,
}: AppTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const navigationPath = createAppNavigationPath(pathname, searchParams);
  const navigationHistorySnapshot = useSyncExternalStore(
    subscribeAppNavigationHistoryChange,
    getAppNavigationHistorySnapshot,
    () => '',
  );
  const navigationHistoryAvailability = getAppNavigationHistoryAvailability(
    parseAppNavigationHistory(navigationHistorySnapshot),
  );
  const activeVault = vaultItems.find((item) => item.id === activeVaultId);
  const activeWorkspaceIndex = workspaceIndexItems.find(
    (item) => item.id === activeWorkspaceIndexId,
  );
  const routeLabel = currentPageLabel ?? getRouteLabel(pathname, labels);
  const isWorkspaceIndexRoute = Boolean(getWorkspaceIndexIdFromPath(pathname));
  const isWorkspaceDocRoute = isWorkspaceDocPath(pathname);
  const activeDocId = getWorkspaceDocIdFromPath(pathname);
  const activeDoc = workspaceDocItems.find((item) => item.id === activeDocId) ?? null;
  const breadcrumbs: BreadcrumbItem[] = [];

  useEffect(() => {
    const nextHistoryState = createNextAppNavigationHistoryState(
      navigationPath,
      readAppNavigationHistory(),
    );

    writeAppNavigationHistory(nextHistoryState);
  }, [navigationPath]);

  if (isWorkspaceIndexRoute || isWorkspaceDocRoute) {
    const workspaceIndexLabel = activeWorkspaceIndex?.name ?? labels.sidebarGroups.knowledge;

    breadcrumbs.push(
      activeWorkspaceIndexId
        ? {
            href: createWorkspaceIndexHref({
              vaultId: activeVaultId,
              vaultSlug: activeVault?.slug,
              workspaceIndexId: activeWorkspaceIndexId,
              workspaceIndexSlug: activeWorkspaceIndex?.slug,
            }),
            label: workspaceIndexLabel,
          }
        : {
            label: workspaceIndexLabel,
          },
    );
  }

  breadcrumbs.push({ label: routeLabel });

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 bg-[var(--background)] px-2 sm:px-4">
      <SidebarTrigger className="size-8 shrink-0 md:hidden" />
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <Button
          aria-label={labels.breadcrumb.back}
          className="size-8 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          disabled={!navigationHistoryAvailability.canGoBack}
          onClick={() => {
            if (navigationHistoryAvailability.canGoBack) {
              router.back();
            }
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label={labels.breadcrumb.forward}
          className="size-8 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          disabled={!navigationHistoryAvailability.canGoForward}
          onClick={() => {
            if (navigationHistoryAvailability.canGoForward) {
              router.forward();
            }
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
        <BreadcrumbList aria-label={labels.breadcrumb.label} className="flex-nowrap">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <Fragment key={`${item.label}-${index}`}>
                <BreadcrumbItem className="min-w-0">
                  {isLast || !item.href ? (
                    <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild className="truncate">
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {isLast ? null : (
                  <BreadcrumbSeparator>
                    <ChevronRight />
                  </BreadcrumbSeparator>
                )}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {isWorkspaceDocPath(pathname) ? (
        <DocTopbarActions
          doc={activeDoc}
          isTableOfContentsOpen={isTableOfContentsOpen}
          labels={labels.topbarDocActions}
          locale={locale}
          onToggleTableOfContents={onToggleTableOfContents}
          vaultId={activeVaultId}
          vaultSlug={activeVault?.slug ?? null}
          pathname={pathname}
          workspaceDocItems={workspaceDocItems}
          workspaceIndexItems={workspaceIndexItems}
        />
      ) : null}
    </header>
  );
}
