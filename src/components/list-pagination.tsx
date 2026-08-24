'use client';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

import type { MouseEvent } from 'react';

type ListPaginationLabels = {
  next: string;
  page: string;
  previous: string;
};

type ListPaginationProps = {
  currentPage: number;
  labels: ListPaginationLabels;
  onPageChange: (page: number) => void;
  pageCount: number;
};

function getPageItems(currentPage: number, pageCount: number): Array<'ellipsis' | number> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', pageCount];
  }

  if (currentPage >= pageCount - 3) {
    return [1, 'ellipsis', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', pageCount];
}

export function ListPagination({
  currentPage,
  labels,
  onPageChange,
  pageCount,
}: ListPaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  const safePage = Math.min(Math.max(currentPage, 1), pageCount);
  const pageItems = getPageItems(safePage, pageCount);

  function handlePageClick(event: MouseEvent<HTMLAnchorElement>, nextPage: number) {
    event.preventDefault();

    if (nextPage < 1 || nextPage > pageCount || nextPage === safePage) {
      return;
    }

    onPageChange(nextPage);
  }

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={safePage === 1}
            className={cn(safePage === 1 ? 'pointer-events-none opacity-50' : null)}
            href="#"
            onClick={(event) => {
              handlePageClick(event, safePage - 1);
            }}
          >
            {labels.previous}
          </PaginationPrevious>
        </PaginationItem>

        {pageItems.map((item, index) =>
          item === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                aria-label={`${labels.page} ${item}`}
                href="#"
                isActive={item === safePage}
                onClick={(event) => {
                  handlePageClick(event, item);
                }}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            aria-disabled={safePage === pageCount}
            className={cn(safePage === pageCount ? 'pointer-events-none opacity-50' : null)}
            href="#"
            onClick={(event) => {
              handlePageClick(event, safePage + 1);
            }}
          >
            {labels.next}
          </PaginationNext>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
