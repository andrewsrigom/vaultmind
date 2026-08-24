'use client';

import { SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

type SearchEmptyStateProps = {
  className?: string;
  description: string;
  onReset?: () => void;
  resetLabel?: string;
  title: string;
};

export function SearchEmptyState({
  className,
  description,
  onReset,
  resetLabel,
  title,
}: SearchEmptyStateProps) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onReset && resetLabel ? (
        <EmptyContent>
          <Button onClick={onReset} type="button" variant="ghost">
            {resetLabel}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
