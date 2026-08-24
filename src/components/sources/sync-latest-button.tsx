'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

type SyncSummary = {
  chunksCreated: number;
  documentsCreated: number;
  documentsDeleted: number;
  documentsFound: number;
  documentsUpdated: number;
  skippedUnchanged: number;
};

type SyncProgress = SyncSummary & {
  processedDocuments: number;
};

type SyncApiResponse =
  | {
      ok: true;
      summary: SyncSummary;
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

type SyncStreamEvent = {
  data: string;
  event: string;
};

type SyncStreamProgressPayload =
  | {
      phase: 'starting';
    }
  | {
      phase: 'loading';
    }
  | {
      documentCount: number;
      phase: 'loaded';
    }
  | {
      phase: 'indexing';
      progress: SyncProgress;
    }
  | {
      phase: 'completed';
      summary: SyncSummary;
    };

type SyncStreamDonePayload = {
  summary: SyncSummary;
};

type SyncStreamErrorPayload = {
  message: string;
};

type SyncLatestButtonProps = {
  className?: string;
  workspaceIndexId: string;
  label?: string;
  sourceId?: string;
  strings: {
    chunks: string;
    created: string;
    deleted: string;
    failed: string;
    found: string;
    latest: string;
    syncing: string;
    fallbackError: string;
    unchanged: string;
    updated: string;
    progress: {
      completed: string;
      indexing: string;
      loaded: string;
      loading: string;
      starting: string;
    };
  };
};

function formatSyncSummary(
  summary: SyncSummary,
  strings: SyncLatestButtonProps['strings'],
): string {
  return [
    `${summary.documentsFound} ${strings.found}`,
    `${summary.documentsCreated} ${strings.created}`,
    `${summary.documentsUpdated} ${strings.updated}`,
    `${summary.documentsDeleted} ${strings.deleted}`,
    `${summary.skippedUnchanged} ${strings.unchanged}`,
    `${summary.chunksCreated} ${strings.chunks}`,
  ].join(' · ');
}

function formatSyncProgress(
  payload: SyncStreamProgressPayload,
  strings: SyncLatestButtonProps['strings'],
): string {
  if (payload.phase === 'starting') {
    return strings.progress.starting;
  }

  if (payload.phase === 'loading') {
    return strings.progress.loading;
  }

  if (payload.phase === 'loaded') {
    return `${strings.progress.loaded}: ${payload.documentCount}`;
  }

  if (payload.phase === 'completed') {
    return strings.progress.completed;
  }

  return [
    `${strings.progress.indexing}: ${payload.progress.processedDocuments}/${payload.progress.documentsFound}`,
    `${payload.progress.documentsCreated} ${strings.created}`,
    `${payload.progress.documentsUpdated} ${strings.updated}`,
    `${payload.progress.skippedUnchanged} ${strings.unchanged}`,
    `${payload.progress.chunksCreated} ${strings.chunks}`,
  ].join(' · ');
}

function parseStreamEvent(block: string): SyncStreamEvent | null {
  const lines = block.split(/\r?\n/u);
  const data: string[] = [];
  let event = 'message';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trimStart());
    }
  }

  if (data.length === 0) {
    return null;
  }

  return {
    data: data.join('\n'),
    event,
  };
}

function parseStreamPayload<TPayload>(data: string): TPayload {
  return JSON.parse(data) as TPayload;
}

export function SyncLatestButton({
  className,
  label,
  sourceId,
  strings,
  workspaceIndexId,
}: SyncLatestButtonProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function handleJsonResponse(response: Response) {
    const payload = (await response.json()) as SyncApiResponse;

    if (!payload.ok) {
      toast.error(payload.error.message);
      return;
    }

    toast.success(formatSyncSummary(payload.summary, strings));
    router.refresh();
  }

  async function handleStreamResponse(response: Response) {
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error(strings.fallbackError);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;

    function handleEvent(parsedEvent: SyncStreamEvent) {
      if (parsedEvent.event === 'progress') {
        const payload = parseStreamPayload<SyncStreamProgressPayload>(parsedEvent.data);

        setProgress(formatSyncProgress(payload, strings));
        return;
      }

      if (parsedEvent.event === 'done') {
        const payload = parseStreamPayload<SyncStreamDonePayload>(parsedEvent.data);

        finished = true;
        toast.success(formatSyncSummary(payload.summary, strings));
        setProgress(null);
        router.refresh();
        return;
      }

      if (parsedEvent.event === 'error') {
        const payload = parseStreamPayload<SyncStreamErrorPayload>(parsedEvent.data);

        throw new Error(payload.message);
      }
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes('\n\n')) {
        const separatorIndex = buffer.indexOf('\n\n');
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsedEvent = parseStreamEvent(block);

        if (parsedEvent) {
          handleEvent(parsedEvent);
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const parsedEvent = parseStreamEvent(buffer);

      if (parsedEvent) {
        handleEvent(parsedEvent);
      }
    }

    if (!finished) {
      throw new Error(strings.fallbackError);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    setProgress(strings.progress.starting);

    try {
      const response = await fetch(`/api/workspace-indexes/${workspaceIndexId}/sync`, {
        body: JSON.stringify({
          ...(sourceId ? { sourceId } : {}),
          stream: true,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const contentType = response.headers.get('Content-Type') ?? '';

      if (contentType.includes('text/event-stream')) {
        await handleStreamResponse(response);
        return;
      }

      await handleJsonResponse(response);
    } catch (syncError: unknown) {
      toast.error(syncError instanceof Error ? syncError.message : strings.fallbackError);
    } finally {
      setIsSyncing(false);
      setProgress(null);
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        className={className}
        disabled={isSyncing}
        onClick={() => {
          void handleSync();
        }}
        type="button"
      >
        {isSyncing ? (
          <Spinner aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" className="size-4" />
        )}
        {isSyncing ? strings.syncing : (label ?? strings.latest)}
      </Button>
      {progress ? (
        <p className="max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">{progress}</p>
      ) : null}
    </div>
  );
}
