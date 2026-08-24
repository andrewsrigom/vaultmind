import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  actionHref?: Route;
  actionLabel?: string;
  className?: string;
  description: string;
  icon?: LucideIcon;
  title: string;
};

export function EmptyState({
  actionHref,
  actionLabel,
  className,
  description,
  icon: Icon,
  title,
}: EmptyStateProps) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {actionHref && actionLabel ? (
        <EmptyContent>
          <Button asChild>
            <Link href={actionHref}>
              {actionLabel}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function RecordEmptyState(props: EmptyStateProps) {
  return <EmptyState {...props} />;
}
