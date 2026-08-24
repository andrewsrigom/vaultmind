'use client';

import {
  Calendar,
  CheckCircle2,
  Database,
  FileSearch,
  FileText,
  GitBranch,
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { createVaultDocHref, createVaultDocumentHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import type { Dictionary } from '@/lib/i18n';
import type { Route } from 'next';

type SearchEntry =
  | {
      id: string;
      kind: 'doc';
      slug: string;
      subtitle: string;
      title: string;
      updatedAt: string;
      workspaceDocId: string;
    }
  | {
      documentId: string;
      id: string;
      kind: 'source-document';
      sourceName: string;
      sourceType: string;
      subtitle: string;
      title: string;
      updatedAt: string;
    };

type SearchApiResponse =
  | {
      entries: SearchEntry[];
      ok: true;
      sourceCount: number;
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

type AppSearchLauncherProps = {
  askHref: Route;
  vaultId: string | null;
  vaultSlug?: string | null | undefined;
  strings: Dictionary['appShell']['searchLauncher'];
  variant?: 'sidebar' | 'topbar';
};

function getEntryHref({
  entry,
  vaultId,
  vaultSlug,
}: {
  entry: SearchEntry;
  vaultId: string;
  vaultSlug?: string | null | undefined;
}): Route {
  if (entry.kind === 'doc') {
    return createVaultDocHref({
      docId: entry.workspaceDocId,
      docSlug: entry.slug,
      vaultId,
      vaultSlug,
    });
  }

  return createVaultDocumentHref({
    documentId: entry.documentId,
    vaultId,
    vaultSlug,
  });
}

function SearchFilterBar({ strings }: { strings: Dictionary['appShell']['searchLauncher'] }) {
  const filters = [
    {
      icon: FileSearch,
      label: strings.filters.sourceType,
    },
    {
      icon: Database,
      label: strings.filters.sources,
    },
    {
      icon: Calendar,
      label: strings.filters.dateRange,
    },
    {
      icon: UserRound,
      label: strings.filters.contributors,
    },
    {
      icon: CheckCircle2,
      label: strings.filters.verified,
    },
  ];

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--muted)] px-3 py-2">
      {filters.map((filter) => {
        const Icon = filter.icon;

        return (
          <button
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            key={filter.label}
            type="button"
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

function SearchResultItem({
  entry,
  onSelect,
}: {
  entry: SearchEntry;
  onSelect: (entry: SearchEntry) => void;
}) {
  const Icon = entry.kind === 'doc' ? FileText : GitBranch;

  return (
    <CommandItem
      onSelect={() => {
        onSelect(entry);
      }}
      value={`${entry.title} ${entry.subtitle}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-[var(--muted-foreground)]" />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate font-medium">{entry.title}</span>
        <span className="truncate text-xs text-[var(--muted-foreground)]">{entry.subtitle}</span>
      </span>
    </CommandItem>
  );
}

export function AppSearchLauncher({
  askHref,
  strings,
  variant = 'topbar',
  vaultId,
  vaultSlug,
}: AppSearchLauncherProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const docs = useMemo(() => entries.filter((entry) => entry.kind === 'doc'), [entries]);
  const sourceDocuments = useMemo(
    () => entries.filter((entry) => entry.kind === 'source-document'),
    [entries],
  );
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setIsOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen || !vaultId) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setErrorMessage(null);

      fetch(`/api/vault/${vaultId}/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as SearchApiResponse;

          if (!payload.ok) {
            throw new Error(payload.error.message);
          }

          setEntries(payload.entries);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          setErrorMessage(error instanceof Error ? error.message : strings.error);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 150);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, vaultId, query, strings.error]);

  function openEntry(entry: SearchEntry) {
    if (!vaultId) {
      return;
    }

    setIsOpen(false);
    router.push(getEntryHref({ entry, vaultId, vaultSlug }));
  }

  return (
    <>
      <div
        className={cn('shrink-0 gap-2', variant === 'sidebar' ? 'grid px-2' : 'flex items-center')}
      >
        <Button
          className={cn(
            'h-9 min-w-0 justify-start gap-2 rounded-md border-[var(--border)] bg-[var(--card)] px-3 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
            variant === 'sidebar' ? 'w-full' : 'sm:w-44',
          )}
          disabled={!vaultId}
          onClick={() => setIsOpen(true)}
          type="button"
          variant="outline"
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className={cn('truncate', variant === 'topbar' && 'hidden sm:inline')}>
            {strings.searchButton}
          </span>
        </Button>
        <Button
          asChild
          className={cn(
            'h-9 shrink-0 justify-start gap-2',
            variant === 'sidebar' ? 'w-full' : null,
          )}
          variant="default"
        >
          <Link href={askHref}>
            <Sparkles aria-hidden="true" className="size-4" />
            <span className={cn(variant === 'topbar' && 'hidden sm:inline')}>
              {strings.askButton}
            </span>
          </Link>
        </Button>
      </div>

      <CommandDialog
        description={strings.dialogDescription}
        onOpenChange={setIsOpen}
        open={isOpen}
        title={strings.dialogTitle}
      >
        <CommandInput onValueChange={setQuery} placeholder={strings.placeholder} value={query} />
        <SearchFilterBar strings={strings} />
        <CommandList>
          {isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
              {strings.loading}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--danger-foreground)]">
              {errorMessage}
            </p>
          ) : null}
          {!isLoading && !errorMessage ? (
            <>
              <CommandEmpty>{strings.empty}</CommandEmpty>
              {docs.length > 0 ? (
                <CommandGroup heading={hasQuery ? strings.docsGroup : strings.recentlyEdited}>
                  {docs.map((entry) => (
                    <SearchResultItem entry={entry} key={entry.id} onSelect={openEntry} />
                  ))}
                </CommandGroup>
              ) : null}
              {docs.length > 0 && sourceDocuments.length > 0 ? <CommandSeparator /> : null}
              {sourceDocuments.length > 0 ? (
                <CommandGroup heading={strings.sourcesGroup}>
                  {sourceDocuments.map((entry) => (
                    <SearchResultItem entry={entry} key={entry.id} onSelect={openEntry} />
                  ))}
                </CommandGroup>
              ) : null}
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
