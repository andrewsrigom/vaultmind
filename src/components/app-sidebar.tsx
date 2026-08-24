'use client';

import {
  Archive,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MoreHorizontal,
  MoveRight,
  PlugZap,
  Settings,
  Share2,
  Star,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { AppSearchLauncher } from '@/components/app-search-launcher';
import { CreateDocDialog } from '@/components/docs/create-doc-dialog';
import { CreateSpaceDialog } from '@/components/spaces/create-space-dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { UserAvatarMenu } from '@/components/user-avatar-menu';
import {
  allAreasSelectorId,
  createVaultDocHref,
  createWorkspaceIndexHref,
  createVaultAskHref,
  createVaultArchiveHref,
  createVaultIntegrationsHref,
  createVaultSettingsHref,
  createVaultWorkspaceIndexesHref,
  getWorkspaceIndexIdFromPath,
  getWorkspaceDocIdFromPath,
  isArchivePath,
  isIntegrationsPath,
  isSettingsPath,
  isWorkspaceDocPath,
  isWorkspaceIndexesPath,
} from '@/lib/routes';
import { WorkspaceAreaIcon } from '@/lib/workspace-area-icons';
import { cn } from '@/lib/utils';
import { updateWorkspaceDocFavorite } from '@/lib/workspace-doc-favorite';

import type { JsonValue, WorkspaceAreaIconName } from '@/db/schema';
import type { WorkspaceDocStatus, WorkspaceDocType } from '@/db/schema';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { Route } from 'next';
import type { ComponentType, ReactNode, SVGProps } from 'react';

export type AppSidebarWorkspaceIndexItem = {
  icon: WorkspaceAreaIconName;
  id: string;
  name: string;
  slug: string;
};

export type AppSidebarWorkspaceDocItem = {
  createdAt: string;
  docType: WorkspaceDocType;
  id: string;
  isFavorite: boolean;
  metadata: JsonValue;
  parentDocId: string | null;
  position: number;
  slug: string;
  status: WorkspaceDocStatus;
  tags: string[];
  title: string;
  updatedAt: string;
  workspaceAreaId: string;
};

export { allAreasSelectorId };

export type AppSidebarWorkspaceIndexSelector = {
  isDisabled: boolean;
  items: AppSidebarWorkspaceIndexItem[];
  label: string;
  placeholder: string;
  selectedId: string | null;
};

export type AppSidebarVaultItem = {
  id: string;
  name: string;
  slug: string;
};

export type AppSidebarVaultSelector = {
  isDisabled: boolean;
  items: AppSidebarVaultItem[];
  label: string;
  placeholder: string;
  selectedId: string | null;
};

type NavItem = {
  href: Route;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  isActive: boolean;
  label: string;
};

type NavGroup = {
  action?: ReactNode;
  defaultOpen: boolean;
  items: NavItem[];
  title: string;
};

type AppSidebarProps = {
  accessLockEnabled: boolean;
  activeWorkspaceIndexId: string | null;
  activeVaultId: string | null;
  workspaceDocItems: AppSidebarWorkspaceDocItem[];
  workspaceIndexSelector: AppSidebarWorkspaceIndexSelector | null;
  labels: {
    appShell: Dictionary['appShell'];
    userMenu: Dictionary['userMenu'];
  };
  locale: Locale;
  vaultSelector: AppSidebarVaultSelector | null;
};

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);

  if (parts.length === 0) {
    return 'V';
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function SidebarLogoMark({ children }: { children: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-[var(--sidebar-primary)] text-xs font-semibold text-[var(--sidebar-primary-foreground)]">
      {children}
    </span>
  );
}

function getWorkspaceDocIcon(docType: WorkspaceDocType): ComponentType<SVGProps<SVGSVGElement>> {
  const icons = {
    article: FileText,
    guide: FileText,
    note: FileText,
  } satisfies Record<WorkspaceDocType, ComponentType<SVGProps<SVGSVGElement>>>;

  return icons[docType];
}

function WorkspaceSwitcher({
  selectedVaultId,
  vaultSelector,
}: {
  vaultSelector: AppSidebarVaultSelector | null;
  selectedVaultId: string;
}) {
  const selectedVault = vaultSelector?.items.find((item) => item.id === selectedVaultId);
  const selectedName = selectedVault?.name ?? vaultSelector?.placeholder ?? 'VaultMind';

  return (
    <div className="flex h-12 w-full min-w-0 items-center gap-3 rounded-md px-2 text-[var(--sidebar-foreground)]">
      <SidebarLogoMark>{getInitials(selectedName)}</SidebarLogoMark>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{selectedName}</span>
        <span className="truncate text-xs text-[var(--sidebar-muted-foreground)]">
          Personal knowledge vault
        </span>
      </span>
    </div>
  );
}

function SidebarNavGroup({ group }: { group: NavGroup }) {
  return (
    <Collapsible className="group/collapsible" defaultOpen={group.defaultOpen}>
      <SidebarGroup>
        <SidebarGroupLabel className="gap-2">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]">
            {group.title}
            <ChevronRight
              aria-hidden="true"
              className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90"
            />
          </CollapsibleTrigger>
          {group.action}
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={`${item.label}-${item.href}`}>
                    <SidebarMenuButton asChild isActive={item.isActive} tooltip={item.label}>
                      <Link aria-current={item.isActive ? 'page' : undefined} href={item.href}>
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

type WorkspaceDocTreeProps = {
  activeDocId: string | null;
  allDocs: AppSidebarWorkspaceDocItem[];
  docs: AppSidebarWorkspaceDocItem[];
  vaultId: string;
  vaultSlug: string | null;
  parentDocId: string | null;
  strings: Dictionary['appShell'];
  workspaceIndexItems: AppSidebarWorkspaceIndexItem[];
};

type WorkspaceSpaceTreeProps = {
  activeDocId: string | null;
  docs: AppSidebarWorkspaceDocItem[];
  isActive: boolean;
  item: AppSidebarWorkspaceIndexItem;
  vaultId: string;
  vaultSlug: string | null;
  pathname: string;
  strings: Dictionary['appShell'];
  workspaceIndexItems: AppSidebarWorkspaceIndexItem[];
};

type SidebarSpacesGroupProps = {
  acceptedAreaItems: AppSidebarWorkspaceIndexItem[];
  activeDocId: string | null;
  currentWorkspaceIndexPathId: string | null;
  docs: AppSidebarWorkspaceDocItem[];
  groupTitle: string;
  vaultId: string;
  vaultSlug: string | null;
  pathname: string;
  selectedConcreteWorkspaceIndexId: string | null;
  strings: Dictionary['appShell'];
  viewAllHref: Route;
};

type WorkspaceDocMoveDestination = {
  depth: number;
  key: string;
  label: string;
  parentDocId: string | null;
  workspaceAreaId: string;
};

type WorkspaceDocMoveResult = {
  id: string;
  slug: string;
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

function isWorkspaceAreaHomeDoc(doc: AppSidebarWorkspaceDocItem): boolean {
  return (
    doc.parentDocId === null &&
    typeof doc.metadata === 'object' &&
    doc.metadata !== null &&
    !Array.isArray(doc.metadata) &&
    doc.metadata.kind === 'space-home'
  );
}

function appendDocDestinations({
  depth,
  destinations,
  docs,
  excludedDocIds,
  parentDocId,
}: {
  depth: number;
  destinations: WorkspaceDocMoveDestination[];
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
}): WorkspaceDocMoveDestination[] {
  const excludedDocIds = collectDescendantDocIds(workspaceDocItems, doc.id);
  excludedDocIds.add(doc.id);

  return workspaceIndexItems
    .filter((workspaceIndex) => workspaceIndex.id !== allAreasSelectorId)
    .flatMap((workspaceIndex) => {
      const spaceDocs = workspaceDocItems.filter(
        (workspaceDoc) => workspaceDoc.workspaceAreaId === workspaceIndex.id,
      );
      const homeDoc = spaceDocs.find(isWorkspaceAreaHomeDoc) ?? null;
      const destinations: WorkspaceDocMoveDestination[] = [
        {
          depth: 0,
          key: `space:${workspaceIndex.id}`,
          label: workspaceIndex.name,
          parentDocId: homeDoc?.id ?? null,
          workspaceAreaId: workspaceIndex.id,
        },
      ];

      appendDocDestinations({
        depth: 1,
        destinations,
        docs: spaceDocs,
        excludedDocIds,
        parentDocId: homeDoc?.id ?? null,
      });

      return destinations;
    });
}

function MoveDocDialog({
  destinations,
  labels,
  onMoved,
  onOpenChange,
  open,
  sourceDocId,
  vaultId,
}: {
  destinations: WorkspaceDocMoveDestination[];
  labels: Dictionary['appShell']['docActions'];
  onMoved: (doc: WorkspaceDocMoveResult) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vaultId: string;
  sourceDocId: string;
}) {
  const [isMoving, setIsMoving] = useState(false);
  const [selectedDestinationKey, setSelectedDestinationKey] = useState<string | null>(null);
  const selectedDestination =
    destinations.find((destination) => destination.key === selectedDestinationKey) ??
    destinations[0] ??
    null;

  async function moveDoc() {
    if (!selectedDestination || isMoving) {
      return;
    }

    setIsMoving(true);

    try {
      const response = await fetch(`/api/vault/${vaultId}/docs/${sourceDocId}/move`, {
        body: JSON.stringify({
          parentDocId: selectedDestination.parentDocId,
          workspaceAreaId: selectedDestination.workspaceAreaId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const payload = (await response.json()) as
        | {
            doc: WorkspaceDocMoveResult;
            ok: true;
          }
        | {
            error: {
              message: string;
            };
            ok: false;
          };

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

function WorkspaceDocActionsMenu({
  allDocs,
  doc,
  href,
  strings,
  vaultId,
  vaultSlug,
  workspaceIndexItems,
}: {
  allDocs: AppSidebarWorkspaceDocItem[];
  doc: AppSidebarWorkspaceDocItem;
  href: Route;
  vaultId: string;
  vaultSlug: string | null;
  strings: Dictionary['appShell']['docActions'];
  workspaceIndexItems: AppSidebarWorkspaceIndexItem[];
}) {
  const router = useRouter();
  const [favoriteOverride, setFavoriteOverride] = useState<{
    docId: string;
    isFavorite: boolean;
  } | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);
  const isFavorite =
    favoriteOverride?.docId === doc.id ? favoriteOverride.isFavorite : doc.isFavorite;

  async function readDocForAction(): Promise<{
    content: string;
    docType: WorkspaceDocType;
    id: string;
    metadata: JsonValue;
    parentDocId: string | null;
    slug: string;
    tags: string[];
    title: string;
    workspaceAreaId: string;
  }> {
    const response = await fetch(`/api/vault/${vaultId}/docs/${doc.id}`);
    const payload = (await response.json()) as
      | {
          doc: {
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
          ok: true;
        }
      | {
          error: {
            message: string;
          };
          ok: false;
        };

    if (!payload.ok) {
      throw new Error(payload.error.message);
    }

    return payload.doc;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      toast.success(strings.copiedLink);
    } catch {
      toast.error(strings.copyLinkError);
    }
  }

  async function toggleFavorite() {
    if (isUpdatingFavorite) {
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
      toast.success(updatedDoc.isFavorite ? strings.favorited : strings.unfavorited);
      router.refresh();
    } catch (error: unknown) {
      setFavoriteOverride({
        docId: doc.id,
        isFavorite: !nextIsFavorite,
      });
      toast.error(error instanceof Error ? error.message : strings.favoriteError);
    } finally {
      setIsUpdatingFavorite(false);
    }
  }

  async function duplicateDoc() {
    if (isDuplicating) {
      return;
    }

    setIsDuplicating(true);

    try {
      const sourceDoc = await readDocForAction();
      const response = await fetch(`/api/vault/${vaultId}/docs`, {
        body: JSON.stringify({
          content: sourceDoc.content,
          docType: sourceDoc.docType,
          metadata: sourceDoc.metadata,
          parentDocId: sourceDoc.parentDocId,
          tags: sourceDoc.tags,
          title: `${sourceDoc.title} ${strings.copyTitleSuffix}`,
          workspaceAreaId: sourceDoc.workspaceAreaId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as
        | {
            doc: {
              id: string;
              slug: string;
            };
            ok: true;
          }
        | {
            error: {
              message: string;
            };
            ok: false;
          };

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      toast.success(strings.duplicated);
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
      toast.error(error instanceof Error ? error.message : strings.duplicateError);
    } finally {
      setIsDuplicating(false);
    }
  }

  const favoriteLabel = isFavorite ? strings.unfavorite : strings.favorite;
  const moveDestinations = getMoveDestinations({
    doc,
    workspaceDocItems: allDocs,
    workspaceIndexItems,
  });

  return (
    <>
      <MoveDocDialog
        destinations={moveDestinations}
        labels={strings}
        onMoved={(movedDoc) => {
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
        sourceDocId={doc.id}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={strings.more}
            className="size-5 rounded-md bg-[var(--sidebar-action-background)] text-[var(--sidebar-muted-foreground)] hover:bg-[var(--sidebar-action-background)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-[var(--sidebar-ring)]"
            size="icon"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal aria-hidden="true" className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            disabled={isUpdatingFavorite}
            onSelect={(event) => {
              event.preventDefault();
              void toggleFavorite();
            }}
          >
            <Star aria-hidden="true" className={isFavorite ? 'fill-current' : undefined} />
            {favoriteLabel}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              void copyLink();
            }}
          >
            <Link2 aria-hidden="true" />
            {strings.copyLink}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={href} target="_blank">
              <ExternalLink aria-hidden="true" />
              {strings.openInNewTab}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <Share2 aria-hidden="true" />
            {strings.share}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isDuplicating}
            onSelect={(event) => {
              event.preventDefault();
              void duplicateDoc();
            }}
          >
            <Copy aria-hidden="true" />
            {strings.duplicate}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={moveDestinations.length === 0}
            onSelect={(event) => {
              event.preventDefault();
              setIsMoveDialogOpen(true);
            }}
          >
            <MoveRight aria-hidden="true" />
            {strings.moveTo}
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Archive aria-hidden="true" />
            {strings.archive}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function WorkspaceDocTree({
  activeDocId,
  allDocs,
  docs,
  parentDocId,
  strings,
  vaultId,
  vaultSlug,
  workspaceIndexItems,
}: WorkspaceDocTreeProps) {
  const childDocs = docs
    .filter((doc) => doc.parentDocId === parentDocId)
    .sort((firstDoc, secondDoc) => {
      if (firstDoc.position !== secondDoc.position) {
        return firstDoc.position - secondDoc.position;
      }

      return firstDoc.title.localeCompare(secondDoc.title);
    });

  return (
    <>
      {childDocs.map((doc) => {
        const href = createVaultDocHref({
          docId: doc.id,
          docSlug: doc.slug,
          vaultId,
          vaultSlug,
        });
        const DocIcon = getWorkspaceDocIcon(doc.docType);
        const hasChildren = docs.some((childDoc) => childDoc.parentDocId === doc.id);
        const isActive = activeDocId === doc.id;

        return (
          <Collapsible
            asChild
            className="group/collapsible"
            defaultOpen={hasChildren || isActive}
            key={doc.id}
          >
            <SidebarMenuSubItem>
              <div
                className={cn(
                  'group/doc-row relative flex min-w-0 items-center gap-1 rounded-md text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]',
                  isActive && 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]',
                )}
              >
                {hasChildren ? (
                  <CollapsibleTrigger asChild>
                    <button
                      aria-label={strings.history.expand}
                      className="flex size-5 shrink-0 items-center justify-center rounded-md text-[var(--sidebar-muted-foreground)] outline-none hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]"
                      type="button"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3 transition-transform group-data-[state=open]/collapsible:rotate-90"
                      />
                    </button>
                  </CollapsibleTrigger>
                ) : (
                  <span className="size-5 shrink-0" aria-hidden="true" />
                )}
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]"
                  href={href}
                >
                  <DocIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-[var(--sidebar-muted-foreground)]"
                  />
                  <span className="truncate">{doc.title}</span>
                </Link>
                <div className="pointer-events-none absolute right-0.5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-[var(--sidebar-action-background)] shadow-[-10px_0_10px_var(--sidebar-action-background)] opacity-0 transition-opacity group-hover/doc-row:pointer-events-auto group-hover/doc-row:opacity-100 group-focus-within/doc-row:pointer-events-auto group-focus-within/doc-row:opacity-100">
                  <CreateDocDialog
                    className="size-5 bg-[var(--sidebar-action-background)] hover:bg-[var(--sidebar-action-background)]"
                    vaultId={vaultId}
                    vaultSlug={vaultSlug}
                    parentDocId={doc.id}
                    strings={strings.createDocDialog}
                    workspaceAreaId={doc.workspaceAreaId}
                  />
                  <WorkspaceDocActionsMenu
                    allDocs={allDocs}
                    doc={doc}
                    href={href}
                    vaultId={vaultId}
                    vaultSlug={vaultSlug}
                    strings={strings.docActions}
                    workspaceIndexItems={workspaceIndexItems}
                  />
                </div>
              </div>
              {hasChildren ? (
                <CollapsibleContent>
                  <SidebarMenuSub className="mx-2 gap-0.5 px-1.5 py-0">
                    <WorkspaceDocTree
                      activeDocId={activeDocId}
                      allDocs={allDocs}
                      docs={docs}
                      vaultId={vaultId}
                      vaultSlug={vaultSlug}
                      parentDocId={doc.id}
                      strings={strings}
                      workspaceIndexItems={workspaceIndexItems}
                    />
                  </SidebarMenuSub>
                </CollapsibleContent>
              ) : null}
            </SidebarMenuSubItem>
          </Collapsible>
        );
      })}
    </>
  );
}

function SidebarFavoritesGroup({
  activeDocId,
  docs,
  strings,
  vaultId,
  vaultSlug,
}: {
  activeDocId: string | null;
  docs: AppSidebarWorkspaceDocItem[];
  vaultId: string;
  vaultSlug: string | null;
  strings: Dictionary['appShell'];
}) {
  const favoriteDocs = docs
    .filter((doc) => doc.isFavorite)
    .sort((firstDoc, secondDoc) => firstDoc.title.localeCompare(secondDoc.title));

  return (
    <Collapsible className="group/collapsible" defaultOpen>
      <SidebarGroup>
        <SidebarGroupLabel>
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]">
            {strings.sidebarGroups.favorites}
            <ChevronRight
              aria-hidden="true"
              className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90"
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            {favoriteDocs.length > 0 ? (
              <SidebarMenu>
                {favoriteDocs.map((doc) => {
                  const href = createVaultDocHref({
                    docId: doc.id,
                    docSlug: doc.slug,
                    vaultId,
                    vaultSlug,
                  });
                  const isActive = activeDocId === doc.id;

                  return (
                    <SidebarMenuItem key={doc.id}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={doc.title}>
                        <Link aria-current={isActive ? 'page' : undefined} href={href}>
                          <Star aria-hidden="true" className="fill-current" />
                          <span>{doc.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            ) : (
              <p className="px-2 py-1 text-xs text-[var(--sidebar-muted-foreground)]">
                {strings.favorites.empty}
              </p>
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function WorkspaceSpaceTree({
  activeDocId,
  docs,
  isActive,
  item,
  pathname,
  strings,
  vaultId,
  vaultSlug,
  workspaceIndexItems,
}: WorkspaceSpaceTreeProps) {
  const areaDocs = docs.filter((doc) => doc.workspaceAreaId === item.id);
  const homeDoc = areaDocs.find(isWorkspaceAreaHomeDoc) ?? null;
  const href = homeDoc
    ? createVaultDocHref({
        docId: homeDoc.id,
        docSlug: homeDoc.slug,
        vaultId,
        vaultSlug,
      })
    : createWorkspaceIndexHref({
        vaultId,
        vaultSlug,
        workspaceIndexId: item.id,
        workspaceIndexSlug: item.slug,
      });
  const childParentDocId = homeDoc?.id ?? null;
  const hasDocs = areaDocs.some((doc) => doc.parentDocId === childParentDocId);
  const isHomeDocActive = activeDocId === homeDoc?.id;

  return (
    <Collapsible asChild className="group/collapsible" defaultOpen={hasDocs || isActive}>
      <SidebarMenuItem>
        <div
          className={cn(
            'group/space-row relative flex min-w-0 items-center gap-1 rounded-md text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]',
            isActive && 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]',
          )}
        >
          {hasDocs ? (
            <CollapsibleTrigger asChild>
              <button
                aria-label={strings.history.expand}
                className="flex size-5 shrink-0 items-center justify-center rounded-md text-[var(--sidebar-muted-foreground)] outline-none hover:text-[var(--sidebar-accent-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]"
                type="button"
              >
                <ChevronRight
                  aria-hidden="true"
                  className="size-3 transition-transform group-data-[state=open]/collapsible:rotate-90"
                />
              </button>
            </CollapsibleTrigger>
          ) : (
            <span className="size-5 shrink-0" aria-hidden="true" />
          )}
          <Link
            aria-current={
              isHomeDocActive || (isActive && !isWorkspaceDocPath(pathname)) ? 'page' : undefined
            }
            className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]"
            href={href}
          >
            <WorkspaceAreaIcon aria-hidden="true" className="size-3.5 shrink-0" icon={item.icon} />
            <span className="truncate">{item.name}</span>
          </Link>
          <div className="pointer-events-none absolute right-0.5 top-1/2 z-10 flex -translate-y-1/2 items-center rounded-md bg-[var(--sidebar-action-background)] shadow-[-10px_0_10px_var(--sidebar-action-background)] opacity-0 transition-opacity group-hover/space-row:pointer-events-auto group-hover/space-row:opacity-100 group-focus-within/space-row:pointer-events-auto group-focus-within/space-row:opacity-100">
            <CreateDocDialog
              className="size-5 bg-[var(--sidebar-action-background)] hover:bg-[var(--sidebar-action-background)]"
              vaultId={vaultId}
              vaultSlug={vaultSlug}
              parentDocId={homeDoc?.id ?? null}
              strings={strings.createDocDialog}
              workspaceAreaId={item.id}
            />
          </div>
        </div>
        {hasDocs ? (
          <CollapsibleContent>
            <SidebarMenuSub className="mx-2 gap-0.5 px-1.5 py-0">
              <WorkspaceDocTree
                activeDocId={activeDocId}
                allDocs={docs}
                docs={areaDocs}
                vaultId={vaultId}
                vaultSlug={vaultSlug}
                parentDocId={childParentDocId}
                strings={strings}
                workspaceIndexItems={workspaceIndexItems}
              />
            </SidebarMenuSub>
          </CollapsibleContent>
        ) : null}
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SidebarSpacesGroup({
  acceptedAreaItems,
  activeDocId,
  currentWorkspaceIndexPathId,
  docs,
  groupTitle,
  pathname,
  selectedConcreteWorkspaceIndexId,
  strings,
  vaultId,
  vaultSlug,
  viewAllHref,
}: SidebarSpacesGroupProps) {
  return (
    <Collapsible className="group/collapsible" defaultOpen>
      <SidebarGroup>
        <SidebarGroupLabel className="gap-2">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-ring)]">
            {groupTitle}
            <ChevronRight
              aria-hidden="true"
              className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90"
            />
          </CollapsibleTrigger>
          <CreateSpaceDialog
            vaultId={vaultId || null}
            vaultSlug={vaultSlug}
            strings={strings.createSpaceDialog}
          />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {acceptedAreaItems.map((item) => (
                <WorkspaceSpaceTree
                  activeDocId={activeDocId}
                  docs={docs}
                  isActive={
                    selectedConcreteWorkspaceIndexId === item.id &&
                    (activeDocId !== null ||
                      currentWorkspaceIndexPathId === item.id ||
                      currentWorkspaceIndexPathId === item.slug)
                  }
                  item={item}
                  key={item.id}
                  vaultId={vaultId}
                  vaultSlug={vaultSlug}
                  pathname={pathname}
                  strings={strings}
                  workspaceIndexItems={acceptedAreaItems}
                />
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="h-7 gap-1.5 px-2 text-sm"
                  isActive={isWorkspaceIndexesPath(pathname)}
                  tooltip={strings.nav.viewAllAreas}
                >
                  <Link
                    aria-current={isWorkspaceIndexesPath(pathname) ? 'page' : undefined}
                    href={viewAllHref}
                  >
                    <FileText aria-hidden="true" />
                    <span>{strings.nav.viewAllAreas}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar({
  accessLockEnabled,
  activeVaultId,
  activeWorkspaceIndexId,
  labels,
  locale,
  vaultSelector,
  workspaceDocItems,
  workspaceIndexSelector,
}: AppSidebarProps) {
  const pathname = usePathname();
  const selectedVaultId = vaultSelector?.items.some((item) => item.id === activeVaultId)
    ? (activeVaultId ?? '')
    : (vaultSelector?.selectedId ?? '');
  const selectedVault = vaultSelector?.items.find((item) => item.id === selectedVaultId);
  const selectedVaultSlug = selectedVault?.slug ?? null;
  const currentWorkspaceIndexPathId = getWorkspaceIndexIdFromPath(pathname);
  const selectedWorkspaceIndexCandidate =
    currentWorkspaceIndexPathId ??
    workspaceIndexSelector?.selectedId ??
    activeWorkspaceIndexId ??
    null;
  const selectedWorkspaceIndexId = workspaceIndexSelector?.items.some(
    (item) =>
      item.id === selectedWorkspaceIndexCandidate || item.slug === selectedWorkspaceIndexCandidate,
  )
    ? (workspaceIndexSelector?.items.find(
        (item) =>
          item.id === selectedWorkspaceIndexCandidate ||
          item.slug === selectedWorkspaceIndexCandidate,
      )?.id ?? '')
    : '';
  const selectedConcreteWorkspaceIndexId =
    selectedWorkspaceIndexId && selectedWorkspaceIndexId !== allAreasSelectorId
      ? selectedWorkspaceIndexId
      : null;
  const integrationsHref = createVaultIntegrationsHref({
    vaultId: selectedVaultId,
    vaultSlug: selectedVaultSlug,
  });
  const settingsHref = createVaultSettingsHref({
    vaultId: selectedVaultId,
    vaultSlug: selectedVaultSlug,
  });
  const archiveHref = createVaultArchiveHref({
    vaultId: selectedVaultId,
    vaultSlug: selectedVaultSlug,
  });
  const workspaceIndexesHref = createVaultWorkspaceIndexesHref({
    vaultId: selectedVaultId,
    vaultSlug: selectedVaultSlug,
  });
  const activeDocId = getWorkspaceDocIdFromPath(pathname);
  const sidebarAreaItems = workspaceIndexSelector?.items ?? [];
  const acceptedAreaItems = sidebarAreaItems.filter((item) => item.id !== allAreasSelectorId);
  const vaultItems: NavItem[] = [
    {
      href: archiveHref,
      icon: Archive,
      isActive: isArchivePath(pathname),
      label: labels.appShell.nav.archive,
    },
    {
      href: integrationsHref,
      icon: PlugZap,
      isActive: isIntegrationsPath(pathname),
      label: labels.appShell.nav.integrations,
    },
    {
      href: settingsHref,
      icon: Settings,
      isActive: isSettingsPath(pathname),
      label: labels.appShell.nav.settings,
    },
  ];
  const vaultGroup: NavGroup = {
    defaultOpen: true,
    items: vaultItems,
    title: 'Vault',
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <WorkspaceSwitcher vaultSelector={vaultSelector} selectedVaultId={selectedVaultId} />
        <AppSearchLauncher
          askHref={createVaultAskHref({
            vaultId: selectedVaultId,
            vaultSlug: selectedVaultSlug,
          })}
          vaultId={selectedVaultId || null}
          vaultSlug={selectedVaultSlug}
          strings={labels.appShell.searchLauncher}
          variant="sidebar"
        />
      </SidebarHeader>

      <SidebarContent aria-label={labels.appShell.navLabel}>
        <SidebarFavoritesGroup
          activeDocId={activeDocId}
          docs={workspaceDocItems}
          vaultId={selectedVaultId}
          vaultSlug={selectedVaultSlug}
          strings={labels.appShell}
        />
        <SidebarSpacesGroup
          acceptedAreaItems={acceptedAreaItems}
          activeDocId={activeDocId}
          currentWorkspaceIndexPathId={currentWorkspaceIndexPathId}
          docs={workspaceDocItems}
          groupTitle={labels.appShell.sidebarGroups.areas}
          vaultId={selectedVaultId}
          vaultSlug={selectedVaultSlug}
          pathname={pathname}
          selectedConcreteWorkspaceIndexId={selectedConcreteWorkspaceIndexId}
          strings={labels.appShell}
          viewAllHref={workspaceIndexesHref}
        />
        <SidebarNavGroup group={vaultGroup} />
      </SidebarContent>

      <SidebarFooter>
        <UserAvatarMenu
          accessLockEnabled={accessLockEnabled}
          align="left"
          labels={{
            localeSwitch: labels.appShell.localeSwitch,
            userMenu: labels.userMenu,
          }}
          locale={locale}
          selectedVaultId={selectedVaultId || null}
          variant="sidebar"
        />
      </SidebarFooter>
    </Sidebar>
  );
}
