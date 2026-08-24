'use client';

import { Search } from 'lucide-react';

import { RetrievedChunkCard } from '@/components/chat/retrieved-chunk-card';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import type { ChatRetrievedSource } from '@/components/chat/types';

type SourcePanelProps = {
  sources: ChatRetrievedSource[];
  strings: {
    close: string;
    empty: string;
    noAnswer: string;
    open: string;
    snippets: string;
    title: string;
  };
};

export function SourcePanel({ sources, strings }: SourcePanelProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-1">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            aria-label={`${strings.open}: ${sources.length} ${strings.snippets}`}
            className="h-8 rounded-full px-3 text-xs"
            size="sm"
            type="button"
            variant="outline"
          >
            <Search aria-hidden="true" className="size-3.5" />
            <span>{strings.open}</span>
            <span className="text-[var(--muted-foreground)]">{sources.length}</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full overflow-hidden sm:max-w-xl">
          <SheetHeader className="border-b border-[var(--border)] px-4 py-3 pr-14">
            <SheetTitle className="text-sm">{strings.title}</SheetTitle>
            <SheetDescription>
              {sources.length} {strings.snippets}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="grid gap-3">
              {sources.map((source) => (
                <RetrievedChunkCard key={source.chunkId} source={source} />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
