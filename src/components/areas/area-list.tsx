'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AreaCard, type AreaCardItem } from '@/components/areas/area-card';
import { ListPagination } from '@/components/list-pagination';
import { SearchEmptyState } from '@/components/search-empty-state';
import { Input } from '@/components/ui/input';

import type { Dictionary } from '@/lib/i18n';

type WorkspaceIndexListProps = {
  areas: AreaCardItem[];
  vaultId: string | null;
  vaultSlug?: string | null;
  strings: Dictionary['workspaceIndexes'] & {
    common: Dictionary['common'];
  };
};

const workspaceIndexPageSize = 8;

function matchesSearch(area: AreaCardItem, searchQuery: string): boolean {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return true;
  }

  return [area.name, area.description ?? '']
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

export function AreaList({ areas, strings, vaultId, vaultSlug }: WorkspaceIndexListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const filteredAreas = useMemo(
    () => areas.filter((area) => matchesSearch(area, searchQuery)),
    [areas, searchQuery],
  );
  const pageCount = Math.ceil(filteredAreas.length / workspaceIndexPageSize);
  const safePage = Math.min(currentPage, pageCount || 1);
  const paginatedAreas = filteredAreas.slice(
    (safePage - 1) * workspaceIndexPageSize,
    safePage * workspaceIndexPageSize,
  );

  return (
    <section className="mt-8 grid gap-4" aria-label={strings.title}>
      <label className="relative block">
        <span className="sr-only">{strings.searchLabel}</span>
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
          placeholder={strings.searchPlaceholder}
          type="search"
          value={searchQuery}
        />
      </label>

      {filteredAreas.length > 0 ? (
        <>
          <div className="grid gap-4">
            {paginatedAreas.map((area) => (
              <AreaCard
                key={area.id}
                area={area}
                vaultId={vaultId}
                vaultSlug={vaultSlug ?? null}
                strings={{
                  ...strings.card,
                  common: strings.common,
                }}
              />
            ))}
          </div>
          <ListPagination
            currentPage={safePage}
            labels={{
              next: strings.common.next,
              page: strings.common.page,
              previous: strings.common.previous,
            }}
            onPageChange={setCurrentPage}
            pageCount={pageCount}
          />
        </>
      ) : (
        <SearchEmptyState
          description={strings.emptySearchDescription}
          onReset={() => {
            setSearchQuery('');
            setCurrentPage(1);
          }}
          resetLabel={strings.clearSearch}
          title={strings.emptySearchTitle}
        />
      )}
    </section>
  );
}
