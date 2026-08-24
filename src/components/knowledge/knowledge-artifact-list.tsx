'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { ListPagination } from '@/components/list-pagination';
import { SearchEmptyState } from '@/components/search-empty-state';
import { Input } from '@/components/ui/input';

import type { Dictionary } from '@/lib/i18n';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type KnowledgeArtifactListProps<TItem> = {
  clearSearchLabel: string;
  common: Pick<Dictionary['common'], 'next' | 'page' | 'previous'>;
  emptyDescription: string;
  emptyIcon: LucideIcon;
  emptySearchDescription: string;
  emptySearchTitle: string;
  emptyTitle: string;
  getSearchText: (item: TItem) => string;
  items: TItem[];
  pageSize?: number;
  renderItem: (item: TItem) => ReactNode;
  searchLabel: string;
  searchPlaceholder: string;
};

const defaultPageSize = 8;

function matchesSearch(searchableText: string, searchQuery: string): boolean {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return true;
  }

  return searchableText.toLocaleLowerCase().includes(normalizedQuery);
}

export function KnowledgeArtifactList<TItem>({
  clearSearchLabel,
  common,
  emptyDescription,
  emptyIcon,
  emptySearchDescription,
  emptySearchTitle,
  emptyTitle,
  getSearchText,
  items,
  pageSize = defaultPageSize,
  renderItem,
  searchLabel,
  searchPlaceholder,
}: KnowledgeArtifactListProps<TItem>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const filteredItems = useMemo(
    () => items.filter((item) => matchesSearch(getSearchText(item), searchQuery)),
    [getSearchText, items, searchQuery],
  );
  const pageCount = Math.ceil(filteredItems.length / pageSize);
  const safePage = Math.min(currentPage, pageCount || 1);
  const paginatedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (items.length === 0) {
    return (
      <EmptyState
        className="min-h-48"
        description={emptyDescription}
        icon={emptyIcon}
        title={emptyTitle}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <label className="relative block">
        <span className="sr-only">{searchLabel}</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
        <Input
          className="h-11 bg-[var(--card)] pl-10"
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setCurrentPage(1);
          }}
          placeholder={searchPlaceholder}
          type="search"
          value={searchQuery}
        />
      </label>

      {filteredItems.length > 0 ? (
        <>
          <div className="grid gap-4">{paginatedItems.map(renderItem)}</div>
          <ListPagination
            currentPage={safePage}
            labels={{
              next: common.next,
              page: common.page,
              previous: common.previous,
            }}
            onPageChange={setCurrentPage}
            pageCount={pageCount}
          />
        </>
      ) : (
        <SearchEmptyState
          description={emptySearchDescription}
          onReset={() => {
            setSearchQuery('');
            setCurrentPage(1);
          }}
          resetLabel={clearSearchLabel}
          title={emptySearchTitle}
        />
      )}
    </div>
  );
}
