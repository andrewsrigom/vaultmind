'use client';

import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { useEffect, useRef } from 'react';

import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

import type { ReactElement } from 'react';

type BlockNoteMarkdownEditorProps = {
  className?: string;
  content: string;
  editable?: boolean;
  minHeightClassName?: string;
  onMarkdownChange: (content: string) => void;
  variant?: 'document' | 'framed';
};

type DefaultBlockNoteEditor = ReturnType<typeof useCreateBlockNote>;

type TypedBlockNoteViewProps = {
  className?: string;
  editable: boolean;
  editor: DefaultBlockNoteEditor;
  onChange: () => void;
  theme: 'light' | 'dark';
};

const TypedBlockNoteView = BlockNoteView as unknown as (
  props: TypedBlockNoteViewProps,
) => ReactElement;

export function BlockNoteMarkdownEditor({
  className,
  content,
  editable = true,
  minHeightClassName = 'min-h-80',
  onMarkdownChange,
  variant = 'framed',
}: BlockNoteMarkdownEditorProps) {
  const editor = useCreateBlockNote();
  const { theme } = useTheme();
  const isReplacingBlocksRef = useRef(false);
  const loadedMarkdownRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedMarkdownRef.current === content) {
      return;
    }

    isReplacingBlocksRef.current = true;

    try {
      const blocks = editor.tryParseMarkdownToBlocks(content);

      editor.replaceBlocks(
        editor.document.map((block) => block.id),
        blocks.length > 0 ? blocks : [{ type: 'paragraph' }],
      );
      loadedMarkdownRef.current = content;
    } finally {
      window.setTimeout(() => {
        isReplacingBlocksRef.current = false;
      }, 0);
    }
  }, [content, editor]);

  return (
    <div
      className={cn(
        'blocknote-markdown-editor overflow-hidden',
        variant === 'framed' &&
          'rounded-md border border-[var(--border)] bg-[var(--card)] shadow-sm',
        variant === 'document' && 'blocknote-document-editor bg-transparent',
        minHeightClassName,
        className,
      )}
    >
      <TypedBlockNoteView
        className="h-full"
        editable={editable}
        editor={editor}
        onChange={() => {
          if (isReplacingBlocksRef.current) {
            return;
          }

          const nextContent = editor.blocksToMarkdownLossy(editor.document);

          loadedMarkdownRef.current = nextContent;
          onMarkdownChange(nextContent);
        }}
        theme={theme}
      />
    </div>
  );
}
