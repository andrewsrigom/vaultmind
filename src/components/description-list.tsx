import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type DescriptionListItem = {
  label: ReactNode;
  value: ReactNode;
};

type DescriptionListProps = {
  className?: string;
  itemClassName?: string;
  items: DescriptionListItem[];
  labelClassName?: string;
  valueClassName?: string;
};

export function DescriptionList({
  className,
  itemClassName,
  items,
  labelClassName,
  valueClassName,
}: DescriptionListProps) {
  return (
    <dl className={cn('grid gap-3 text-sm', className)}>
      {items.map((item, index) => (
        <div className={itemClassName} key={`${String(item.label)}-${index}`}>
          <dt className={cn('text-[var(--muted-foreground)]', labelClassName)}>{item.label}</dt>
          <dd className={cn('mt-1 font-medium text-[var(--foreground)]', valueClassName)}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
