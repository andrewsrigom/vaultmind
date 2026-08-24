import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type IconFrameProps = HTMLAttributes<HTMLSpanElement> & {
  hasBorder?: boolean;
  radius?: 'md' | 'lg';
  size?: 'md' | 'lg' | 'xl';
  tone?: 'neutral' | 'primary' | 'sidebar' | 'warning';
};

const iconFrameSizeClassNames = {
  lg: 'size-11',
  md: 'size-10',
  xl: 'size-12',
} satisfies Record<NonNullable<IconFrameProps['size']>, string>;

const iconFrameToneClassNames = {
  neutral: 'bg-[var(--muted)] text-[var(--foreground)]',
  primary: 'bg-[var(--muted)] text-[var(--primary)]',
  sidebar: 'bg-[var(--sidebar)] text-white',
  warning: 'bg-[var(--warning-muted)] text-[var(--warning-foreground)]',
} satisfies Record<NonNullable<IconFrameProps['tone']>, string>;

export function IconFrame({
  className,
  hasBorder = false,
  radius = 'lg',
  size = 'md',
  tone = 'primary',
  ...props
}: IconFrameProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        iconFrameSizeClassNames[size],
        iconFrameToneClassNames[tone],
        radius === 'lg' ? 'rounded-lg' : 'rounded-md',
        hasBorder ? 'border border-[var(--border)]' : null,
        className,
      )}
      {...props}
    />
  );
}
