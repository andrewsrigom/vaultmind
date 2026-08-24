import type { ReactNode } from 'react';

import { Heading, Paragraph } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

type MetricCardProps = {
  className?: string;
  description?: ReactNode;
  label?: ReactNode;
  tone?: 'default' | 'warning';
  value: ReactNode;
  valueSize?: 'default' | 'large';
};

export function MetricCard({
  className,
  description,
  label,
  tone = 'default',
  value,
  valueSize = 'default',
}: MetricCardProps) {
  return (
    <article
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--card)] p-4',
        tone === 'warning' ? 'border-[var(--warning-border)] bg-[var(--warning-muted)]' : null,
        className,
      )}
    >
      <p
        className={cn(
          'font-semibold text-[var(--foreground)]',
          valueSize === 'large' ? 'text-3xl' : 'text-2xl',
        )}
      >
        {value}
      </p>
      {label ? (
        <Heading className="mt-2" level={3} variant="compact">
          {label}
        </Heading>
      ) : null}
      {description ? (
        <Paragraph className="mt-1" variant={label ? 'caption' : 'muted'}>
          {description}
        </Paragraph>
      ) : null}
    </article>
  );
}
