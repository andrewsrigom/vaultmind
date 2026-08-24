import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { AppShell } from '@/components/app-shell';
import { ArticleDocumentLayout } from '@/components/articles/article-renderer';
import { DatabaseUnavailableState } from '@/components/database-unavailable-state';
import { DescriptionList } from '@/components/description-list';
import { MarkdownContent } from '@/components/markdown-content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getVaultDocument } from '@/db/queries/documents';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { requireVaultPageAccess } from '@/lib/access/page-access';
import { formatDateTime } from '@/lib/date-format';
import { getDictionary } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { createVaultAreaHref, createVaultDocumentHref } from '@/lib/routes';
import { getWorkspaceSourceTypeLabel } from '@/lib/source-type-labels';

import type { VaultDocument } from '@/db/queries/documents';
import type { Route } from 'next';

type VaultDocumentPageProps = {
  params: Promise<{
    documentId: string;
    vaultId: string;
  }>;
  searchParams: Promise<{
    areaId?: string;
  }>;
};

type BackLink = {
  href: Route;
  label: string;
};

export const dynamic = 'force-dynamic';

const routeParamsSchema = z.object({
  documentId: z.uuid(),
  vaultId: z.string().min(1),
});

function normalizeHeadingText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function removeDuplicateTitleHeading(content: string, title: string): string {
  const contentWithoutByteOrderMark = content.replace(/^\uFEFF/u, '');
  const firstHeadingMatch = contentWithoutByteOrderMark.match(/^#\s+(.+?)(?:\r?\n|$)/u);

  if (
    !firstHeadingMatch?.[1] ||
    normalizeHeadingText(firstHeadingMatch[1]) !== normalizeHeadingText(title)
  ) {
    return content;
  }

  return contentWithoutByteOrderMark.slice(firstHeadingMatch[0].length).replace(/^\r?\n/u, '');
}

export default async function VaultDocumentPage({ params, searchParams }: VaultDocumentPageProps) {
  const parsedParams = routeParamsSchema.safeParse(await params);

  if (!parsedParams.success) {
    notFound();
  }

  const { documentId, vaultId } = parsedParams.data;
  const vault = await getVaultByIdOrSlug(vaultId);

  if (!vault) {
    notFound();
  }

  const resolvedVaultId = vault.id;
  const vaultSlug = vault.slug;
  const resolvedSearchParams = await searchParams;
  await requireVaultPageAccess({
    returnTo: createVaultDocumentHref({
      areaId: resolvedSearchParams.areaId,
      documentId,
      vaultId: resolvedVaultId,
      vaultSlug,
    }),
    vaultId: resolvedVaultId,
  });

  const parsedAreaId = z.uuid().safeParse(resolvedSearchParams.areaId);
  const areaId = parsedAreaId.success ? parsedAreaId.data : null;
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  let databaseUnavailable = false;
  let document: VaultDocument | null = null;

  try {
    document = await getVaultDocument({
      documentId,
      vaultId: resolvedVaultId,
    });
  } catch {
    databaseUnavailable = true;
  }

  if (databaseUnavailable) {
    return (
      <AppShell activeVaultId={resolvedVaultId} activeWorkspaceIndexId={areaId}>
        <DatabaseUnavailableState
          description={dictionary.chat.hub.databaseOverlay.description}
          headingLevel={1}
          title={dictionary.chat.hub.databaseOverlay.title}
        />
      </AppShell>
    );
  }

  if (!document) {
    notFound();
  }

  const sourceTypeLabel = getWorkspaceSourceTypeLabel(
    document.sourceType,
    dictionary.documents.sourceTypes,
  );
  const backLink: BackLink | null = areaId
    ? {
        href: createVaultAreaHref({
          areaId,
          vaultId: resolvedVaultId,
          vaultSlug,
        }),
        label: dictionary.documents.detail.backToArea,
      }
    : null;
  const details = [
    {
      label: dictionary.documents.detail.sourceLabel,
      value: document.sourceName,
    },
    {
      label: dictionary.documents.detail.sourceTypeLabel,
      value: sourceTypeLabel,
    },
    {
      label: dictionary.documents.detail.pathLabel,
      value: document.path,
    },
    {
      label: dictionary.documents.detail.updatedLabel,
      value: formatDateTime(document.updatedAt, locale),
    },
  ];
  const renderedContent = removeDuplicateTitleHeading(document.content, document.title);

  return (
    <AppShell activeVaultId={resolvedVaultId} activeWorkspaceIndexId={areaId}>
      <ArticleDocumentLayout
        actions={
          backLink ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link href={backLink.href}>
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  {backLink.label}
                </Link>
              </Button>
            </div>
          ) : null
        }
        areaName={document.sourceName}
        footer={
          <footer className="mx-auto mt-12 max-w-3xl border-t border-[var(--border)] pt-8">
            <section className="grid gap-3" aria-labelledby="document-details-heading">
              <h2
                className="text-sm font-semibold text-[var(--foreground)]"
                id="document-details-heading"
              >
                {dictionary.documents.detail.detailsTitle}
              </h2>
              <DescriptionList
                items={details}
                labelClassName="text-xs font-medium uppercase"
                valueClassName="break-words font-normal"
              />
            </section>
          </footer>
        }
        locale={locale}
        status="draft"
        statusNode={<Badge variant="muted">{sourceTypeLabel}</Badge>}
        title={
          <div className="grid gap-3">
            <h1 className="break-words text-3xl font-semibold leading-tight text-[var(--foreground)]">
              {document.title}
            </h1>
            <p className="break-all text-sm leading-6 text-[var(--muted-foreground)]">
              {document.path}
            </p>
          </div>
        }
        updatedAt={document.updatedAt}
      >
        <MarkdownContent content={renderedContent} variant="document" />
      </ArticleDocumentLayout>
    </AppShell>
  );
}
