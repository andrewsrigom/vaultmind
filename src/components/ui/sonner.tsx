'use client';

import { Toaster as Sonner } from 'sonner';

import type { ComponentProps } from 'react';

type ToasterProps = ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      closeButton
      position="bottom-right"
      richColors
      toastOptions={{
        classNames: {
          actionButton:
            'group-[.toast]:bg-[var(--primary)] group-[.toast]:text-[var(--primary-foreground)]',
          cancelButton:
            'group-[.toast]:bg-[var(--muted)] group-[.toast]:text-[var(--muted-foreground)]',
          description: 'group-[.toast]:text-[var(--muted-foreground)]',
          toast:
            'group toast group-[.toaster]:border-[var(--border)] group-[.toaster]:bg-[var(--card)] group-[.toaster]:text-[var(--foreground)] group-[.toaster]:shadow-lg',
        },
      }}
      {...props}
    />
  );
}
