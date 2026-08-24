import { SearchX } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { defaultVaultId, defaultVaultSlug } from '@/db/schema';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { createVaultAskHref, createVaultWorkspaceIndexesHref } from '@/lib/routes';

export default async function NotFound() {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  const askHref = createVaultAskHref({
    vaultId: defaultVaultId,
    vaultSlug: defaultVaultSlug,
  });
  const workspaceIndexesHref = createVaultWorkspaceIndexesHref({
    vaultId: defaultVaultId,
    vaultSlug: defaultVaultSlug,
  });

  return (
    <main
      className="min-h-screen bg-[var(--background)] p-4 text-[var(--foreground)]"
      id="main-content"
    >
      <section className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
        <Empty className="w-full max-w-2xl border-solid">
          <EmptyHeader>
            <div className="text-xs font-semibold uppercase text-[var(--primary)]">
              {dictionary.notFound.eyebrow}
            </div>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{dictionary.notFound.title}</EmptyTitle>
            <EmptyDescription>{dictionary.notFound.description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-col sm:flex-row">
            <Button asChild>
              <Link href={askHref}>{dictionary.notFound.primaryAction}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={workspaceIndexesHref}>{dictionary.notFound.secondaryAction}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </section>
    </main>
  );
}
