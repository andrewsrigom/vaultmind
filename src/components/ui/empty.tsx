import * as React from 'react';

import { typographyClassNames } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        'flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Empty.displayName = 'Empty';

const EmptyHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn('flex flex-col items-center gap-2', className)} ref={ref} {...props} />
  ),
);
EmptyHeader.displayName = 'EmptyHeader';

type EmptyMediaProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'icon';
};

const EmptyMedia = React.forwardRef<HTMLDivElement, EmptyMediaProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      className={cn(
        'flex items-center justify-center',
        variant === 'icon'
          ? 'mb-2 size-11 rounded-lg bg-[var(--muted)] text-[var(--primary)] [&_svg]:size-5'
          : null,
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
EmptyMedia.displayName = 'EmptyMedia';

const EmptyTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 className={cn(typographyClassNames.sectionTitle, className)} ref={ref} {...props} />
  ),
);
EmptyTitle.displayName = 'EmptyTitle';

const EmptyDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p className={cn('max-w-xl', typographyClassNames.description, className)} ref={ref} {...props} />
));
EmptyDescription.displayName = 'EmptyDescription';

const EmptyContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn('mt-5 flex items-center justify-center gap-2', className)}
      ref={ref}
      {...props}
    />
  ),
);
EmptyContent.displayName = 'EmptyContent';

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
