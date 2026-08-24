import * as React from 'react';

import { cn } from '@/lib/utils';

export const typographyClassNames = {
  body: 'text-sm leading-6 text-[var(--foreground)]',
  caption: 'text-xs leading-5 text-[var(--muted-foreground)]',
  compactTitle: 'text-sm font-semibold text-[var(--foreground)]',
  description: 'text-sm leading-6 text-[var(--muted-foreground)]',
  muted: 'text-sm text-[var(--muted-foreground)]',
  mutedEyebrow: 'text-xs font-medium uppercase text-[var(--muted-foreground)]',
  pageTitle: 'text-3xl font-semibold tracking-normal text-[var(--foreground)]',
  panelTitle: 'text-base font-semibold text-[var(--foreground)]',
  primaryEyebrow: 'text-xs font-semibold uppercase text-[var(--primary)]',
  sectionTitle: 'text-lg font-semibold text-[var(--foreground)]',
} as const;

export type HeadingLevel = 1 | 2 | 3 | 4;
export type HeadingVariant = 'compact' | 'page' | 'panel' | 'section';
export type ParagraphVariant = 'body' | 'caption' | 'description' | 'muted';

const headingVariantClassNames = {
  compact: typographyClassNames.compactTitle,
  page: typographyClassNames.pageTitle,
  panel: typographyClassNames.panelTitle,
  section: typographyClassNames.sectionTitle,
} satisfies Record<HeadingVariant, string>;

const paragraphVariantClassNames = {
  body: typographyClassNames.body,
  caption: typographyClassNames.caption,
  description: typographyClassNames.description,
  muted: typographyClassNames.muted,
} satisfies Record<ParagraphVariant, string>;

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement> & {
  level?: HeadingLevel;
  variant?: HeadingVariant;
};

export function Heading({ className, level = 2, variant = 'section', ...props }: HeadingProps) {
  const resolvedClassName = cn(headingVariantClassNames[variant], className);

  if (level === 1) {
    return <h1 className={resolvedClassName} {...props} />;
  }

  if (level === 3) {
    return <h3 className={resolvedClassName} {...props} />;
  }

  if (level === 4) {
    return <h4 className={resolvedClassName} {...props} />;
  }

  return <h2 className={resolvedClassName} {...props} />;
}

type ParagraphProps = React.HTMLAttributes<HTMLParagraphElement> & {
  variant?: ParagraphVariant;
};

export function Paragraph({ className, variant = 'description', ...props }: ParagraphProps) {
  return <p className={cn(paragraphVariantClassNames[variant], className)} {...props} />;
}

type EyebrowProps = React.HTMLAttributes<HTMLParagraphElement> & {
  tone?: 'muted' | 'primary';
};

export function Eyebrow({ className, tone = 'primary', ...props }: EyebrowProps) {
  return (
    <p
      className={cn(
        tone === 'primary'
          ? typographyClassNames.primaryEyebrow
          : typographyClassNames.mutedEyebrow,
        className,
      )}
      {...props}
    />
  );
}
