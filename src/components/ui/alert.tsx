import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
        destructive:
          'border-[var(--danger-border)] bg-[var(--danger-muted)] text-[var(--danger-foreground)] [&>svg]:text-[var(--danger-foreground)]',
        success:
          'border-[var(--success-border)] bg-[var(--success-muted)] text-[var(--success-foreground)] [&>svg]:text-[var(--success-foreground)]',
        warning:
          'border-[var(--warning-border)] bg-[var(--warning-muted)] text-[var(--warning-foreground)] [&>svg]:text-[var(--warning-foreground)]',
      },
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div className={cn(alertVariants({ variant }), className)} ref={ref} role="alert" {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      ref={ref}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div className={cn('text-sm [&_p]:leading-relaxed', className)} ref={ref} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
