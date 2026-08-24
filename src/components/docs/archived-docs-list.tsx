'use client';

import { ArchiveRestore, Eye, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createVaultDocHref } from '@/lib/routes';

import type { Dictionary } from '@/lib/i18n';

export type ArchivedDocListItem = {
  archivedAt: string;
  id: string;
  slug: string;
  spaceName: string;
  title: string;
};

type ArchivedDocsListProps = {
  docs: ArchivedDocListItem[];
  vaultId: string;
  vaultSlug?: string | null;
  strings: Dictionary['workspaceDocs']['archivePage'];
};

export function ArchivedDocsList({
  docs,
  strings,
  vaultId,
  vaultSlug = null,
}: ArchivedDocsListProps) {
  const router = useRouter();
  const [restoringDocId, setRestoringDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const filteredDocs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return docs;
    }

    return docs.filter((doc) =>
      `${doc.title} ${doc.spaceName}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [docs, searchQuery]);

  async function restoreDoc(docId: string) {
    if (restoringDocId) {
      return;
    }

    setRestoringDocId(docId);

    try {
      const response = await fetch(`/api/vault/${vaultId}/docs/${docId}/archive`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as
        | {
            ok: true;
          }
        | {
            error: {
              message: string;
            };
            ok: false;
          };

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      toast.success(strings.restored);
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : strings.restoreError);
    } finally {
      setRestoringDocId(null);
    }
  }

  if (docs.length === 0) {
    return (
      <EmptyState
        className="min-h-72"
        description={strings.emptyDescription}
        icon={FileText}
        title={strings.emptyTitle}
      />
    );
  }

  return (
    <section className="grid gap-4" aria-label={strings.title}>
      <label className="block">
        <span className="sr-only">{strings.searchLabel}</span>
        <Input
          className="h-11 bg-[var(--card)]"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={strings.searchPlaceholder}
          type="search"
          value={searchQuery}
        />
      </label>
      <div className="grid gap-2">
        {filteredDocs.map((doc) => {
          const docHref = createVaultDocHref({
            docId: doc.id,
            docSlug: doc.slug,
            vaultId,
            vaultSlug,
          });

          return (
            <article
              className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center"
              key={doc.id}
            >
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-medium text-[var(--foreground)]">
                  {doc.title}
                </h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {strings.spaceLabel}: {doc.spaceName} / {strings.archivedAt}: {doc.archivedAt}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={docHref}>
                    <Eye aria-hidden="true" className="size-4" />
                    {strings.open}
                  </Link>
                </Button>
                <Button
                  disabled={restoringDocId !== null}
                  onClick={() => void restoreDoc(doc.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ArchiveRestore aria-hidden="true" className="size-4" />
                  {restoringDocId === doc.id ? strings.restoring : strings.restore}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
