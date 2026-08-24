import { AlertTriangle } from 'lucide-react';

import { IconFrame } from '@/components/icon-frame';
import { Heading, Paragraph, type HeadingLevel } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

type DatabaseUnavailableStateProps = {
  className?: string;
  description: string;
  headingLevel?: HeadingLevel;
  steps?: string[];
  title: string;
};

export function DatabaseUnavailableState({
  className,
  description,
  headingLevel = 2,
  steps,
  title,
}: DatabaseUnavailableStateProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-[var(--warning-border)] bg-[var(--card)] p-6 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <IconFrame tone="warning">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </IconFrame>
        <div>
          <Heading level={headingLevel}>{title}</Heading>
          <Paragraph className="mt-2">{description}</Paragraph>
        </div>
      </div>
      {steps?.length ? (
        <ul className="mt-5 grid gap-2 text-sm leading-6 text-[var(--foreground)]">
          {steps.map((step) => (
            <li className="rounded-md bg-[var(--muted)] px-3 py-2" key={step}>
              {step}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
