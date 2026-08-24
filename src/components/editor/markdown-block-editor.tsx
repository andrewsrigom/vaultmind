'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';

export const MarkdownBlockEditor = dynamic(
  () =>
    import('@/components/editor/blocknote-markdown-editor').then(
      (module) => module.BlockNoteMarkdownEditor,
    ),
  {
    loading: () => <Skeleton className="min-h-80 rounded-md" />,
    ssr: false,
  },
);
