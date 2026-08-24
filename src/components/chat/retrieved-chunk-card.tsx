import { FileText } from 'lucide-react';

import { getWorkspaceSourceTypeLabel } from '@/lib/source-type-labels';

import type { ChatRetrievedSource } from '@/components/chat/types';

type RetrievedChunkCardProps = {
  source: ChatRetrievedSource;
};

function formatSimilarity(similarity: number): string {
  const boundedSimilarity = Math.min(Math.max(similarity, 0), 1);

  return `${Math.round(boundedSimilarity * 100)}%`;
}

export function RetrievedChunkCard({ source }: RetrievedChunkCardProps) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--primary)]">
          <FileText aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-[var(--info-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--info-foreground)]">
              [{source.citationIndex}]
            </span>
            <span className="max-w-full truncate rounded bg-[var(--muted)] px-2 py-0.5 text-xs font-medium text-[var(--foreground)]">
              {source.workspaceIndexName ?? source.sourceName}
            </span>
            {source.workspaceIndexName ? (
              <span className="max-w-full truncate rounded bg-[var(--muted)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
                {source.sourceName}
              </span>
            ) : null}
            <span className="rounded bg-[var(--muted)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
              {formatSimilarity(source.similarity)}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold leading-5">{source.title}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
            {getWorkspaceSourceTypeLabel(source.sourceType)}
          </p>
          <p className="mt-1 break-all text-xs leading-5 text-[var(--muted-foreground)]">
            {source.path}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{source.snippet}</p>
    </article>
  );
}
