'use client';

import { Loader2, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';

import { AppTopbar } from '@/components/app-topbar';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getWorkspaceDocIdFromPath, isWorkspaceDocPath } from '@/lib/routes';

import type {
  AppSidebarWorkspaceIndexItem,
  AppSidebarVaultItem,
  AppSidebarWorkspaceDocItem,
} from '@/components/app-sidebar';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { ReactNode } from 'react';

type AppFrameProps = {
  activeWorkspaceIndexId: string | null;
  activeVaultId: string | null;
  children: ReactNode;
  currentPageLabel?: string | null;
  workspaceDocItems: AppSidebarWorkspaceDocItem[];
  workspaceIndexItems: AppSidebarWorkspaceIndexItem[];
  labels: Dictionary['appShell'];
  locale: Locale;
  vaultItems: AppSidebarVaultItem[];
  sidebar: ReactNode;
};

type TableOfContentsItem = {
  depth: number;
  id: string;
  occurrence: number;
  title: string;
};

type WorkspaceDocContentResponse =
  | {
      doc: {
        content: string;
      };
      ok: true;
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

function normalizeHeadingText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripMarkdownHeadingText(value: string): string {
  return normalizeHeadingText(
    value
      .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
      .replace(/<[^>]+>/gu, '')
      .replace(/[`*_~]/gu, ''),
  );
}

function slugifyHeading(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'heading'
  );
}

function parseMarkdownTableOfContents(markdown: string): TableOfContentsItem[] {
  const items: TableOfContentsItem[] = [];
  const titleOccurrences = new Map<string, number>();
  let isInFence = false;

  markdown.split(/\r?\n/u).forEach((line, lineIndex) => {
    const trimmedLine = line.trim();

    if (/^(```|~~~)/u.test(trimmedLine)) {
      isInFence = !isInFence;
      return;
    }

    if (isInFence) {
      return;
    }

    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(trimmedLine);

    if (!headingMatch) {
      return;
    }

    const title = stripMarkdownHeadingText(headingMatch[2] ?? '');

    if (!title) {
      return;
    }

    const occurrence = titleOccurrences.get(title) ?? 0;
    titleOccurrences.set(title, occurrence + 1);
    items.push({
      depth: headingMatch[1]?.length ?? 1,
      id: `${lineIndex}-${slugifyHeading(title)}`,
      occurrence,
      title,
    });
  });

  return items;
}

export function AppFrame({
  activeVaultId,
  activeWorkspaceIndexId,
  children,
  currentPageLabel = null,
  labels,
  locale,
  sidebar,
  vaultItems,
  workspaceDocItems,
  workspaceIndexItems,
}: AppFrameProps) {
  const pathname = usePathname();
  const activeDocId = getWorkspaceDocIdFromPath(pathname);
  const canShowTableOfContents = Boolean(
    activeVaultId && activeDocId && isWorkspaceDocPath(pathname),
  );
  const [isTableOfContentsLoading, setIsTableOfContentsLoading] = useState(false);
  const [isTableOfContentsOpen, setIsTableOfContentsOpen] = useState(false);
  const [tableOfContentsDocId, setTableOfContentsDocId] = useState<string | null>(null);
  const [tableOfContentsError, setTableOfContentsError] = useState<string | null>(null);
  const [tableOfContentsItems, setTableOfContentsItems] = useState<TableOfContentsItem[]>([]);
  const tableOfContentsLabels = labels.topbarDocActions;
  const shouldShowTableOfContents =
    isTableOfContentsOpen && canShowTableOfContents && tableOfContentsDocId === activeDocId;

  const loadTableOfContents = useCallback(
    async ({ docId, vaultId }: { docId: string; vaultId: string }) => {
      setIsTableOfContentsLoading(true);
      setTableOfContentsError(null);
      setTableOfContentsDocId(docId);
      setTableOfContentsItems([]);

      try {
        const response = await fetch(`/api/vault/${vaultId}/docs/${docId}`);
        const payload = (await response.json()) as WorkspaceDocContentResponse;

        if (!payload.ok) {
          throw new Error(payload.error.message);
        }

        setTableOfContentsItems(parseMarkdownTableOfContents(payload.doc.content));
      } catch (error: unknown) {
        setTableOfContentsError(
          error instanceof Error ? error.message : tableOfContentsLabels.tableOfContentsError,
        );
      } finally {
        setIsTableOfContentsLoading(false);
      }
    },
    [tableOfContentsLabels.tableOfContentsError],
  );

  function toggleTableOfContents() {
    if (!activeVaultId || !activeDocId) {
      return;
    }

    const shouldOpen = !shouldShowTableOfContents;
    setIsTableOfContentsOpen(shouldOpen);

    if (shouldOpen) {
      void loadTableOfContents({ docId: activeDocId, vaultId: activeVaultId });
    }
  }

  function selectTableOfContentsItem(item: TableOfContentsItem) {
    const matchingHeadings = Array.from(
      document.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6'),
    ).filter((heading) => normalizeHeadingText(heading.textContent ?? '') === item.title);
    const targetHeading = matchingHeadings[item.occurrence] ?? matchingHeadings[0] ?? null;

    targetHeading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <SidebarProvider>
      {sidebar}
      <SidebarInset key="app-content" className="min-w-0 md:h-screen md:min-h-0 md:overflow-hidden">
        <AppTopbar
          activeWorkspaceIndexId={activeWorkspaceIndexId}
          activeVaultId={activeVaultId}
          currentPageLabel={currentPageLabel}
          isTableOfContentsOpen={shouldShowTableOfContents}
          workspaceDocItems={workspaceDocItems}
          workspaceIndexItems={workspaceIndexItems}
          labels={labels}
          locale={locale}
          onToggleTableOfContents={toggleTableOfContents}
          vaultItems={vaultItems}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto p-4" id="main-content" tabIndex={-1}>
            {children}
          </div>
          {shouldShowTableOfContents ? (
            <aside
              aria-label={tableOfContentsLabels.tableOfContentsTitle}
              className="flex w-[min(20rem,42vw)] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--background)]"
            >
              <header className="flex min-h-16 items-start gap-3 border-b border-[var(--border)] px-4 py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {tableOfContentsLabels.tableOfContentsTitle}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {tableOfContentsLabels.tableOfContentsDescription}
                  </p>
                </div>
                <Button
                  aria-label={tableOfContentsLabels.closeTableOfContents}
                  className="size-7 shrink-0 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  onClick={() => setIsTableOfContentsOpen(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {isTableOfContentsLoading ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-sm text-[var(--muted-foreground)]">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    <span>{tableOfContentsLabels.tableOfContentsLoading}</span>
                  </div>
                ) : tableOfContentsError ? (
                  <p className="px-2 py-3 text-sm text-[var(--danger-foreground)]">
                    {tableOfContentsError}
                  </p>
                ) : tableOfContentsItems.length > 0 ? (
                  <nav aria-label={tableOfContentsLabels.tableOfContentsTitle}>
                    <ul className="grid gap-1">
                      {tableOfContentsItems.map((item) => (
                        <li key={item.id}>
                          <button
                            className="flex w-full min-w-0 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            onClick={() => selectTableOfContentsItem(item)}
                            style={{ paddingLeft: `${8 + Math.max(item.depth - 1, 0) * 12}px` }}
                            type="button"
                          >
                            <span className="truncate">{item.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : (
                  <p className="px-2 py-3 text-sm text-[var(--muted-foreground)]">
                    {tableOfContentsLabels.tableOfContentsEmpty}
                  </p>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
