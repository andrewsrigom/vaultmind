import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:brightness-95',
        destructive:
          'border-[var(--danger-border)] bg-[var(--danger-muted)] text-[var(--danger-foreground)]',
        muted: 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]',
        outline: 'border-[var(--border)] text-[var(--foreground)]',
        secondary:
          'border-transparent bg-[var(--muted)] text-[var(--foreground)] hover:brightness-95',
        success:
          'border-[var(--success-border)] bg-[var(--success-muted)] text-[var(--success-foreground)]',
        warning:
          'border-[var(--warning-border)] bg-[var(--warning-muted)] text-[var(--warning-foreground)]',
      },
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
