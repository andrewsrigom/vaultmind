import { AlertTriangle, Archive, CheckCircle2, Clock3, FileText } from 'lucide-react';
import Link from 'next/link';

import { MarkdownContent } from '@/components/markdown-content';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/date-format';
import { createVaultDocumentHref } from '@/lib/routes';
import { getWorkspaceSourceTypeLabel } from '@/lib/source-type-labels';
import { cn } from '@/lib/utils';

import type { Article, ArticleStatus, JsonValue, WorkspaceSourceType } from '@/db/schema';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { WorkspaceSourceTypeLabels } from '@/lib/source-type-labels';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import type { Route } from 'next';

type ArticleRendererProps = {
  actions?: ReactNode;
  article: Article;
  areaName?: string | null;
  locale: Locale;
  vaultSlug?: string | null;
  sourceTypeStrings?: WorkspaceSourceTypeLabels | undefined;
  strings: Dictionary['articles'];
};

type ArticleDocumentLayoutProps = {
  actions?: ReactNode;
  articleId?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  children: ReactNode;
  footer?: false | ReactNode;
  locale: Locale;
  noSourcesLabel?: string;
  vaultId?: string | null;
  vaultSlug?: string | null;
  preTitle?: ReactNode;
  sourceReferences?: KnowledgeArtifactSourceReference[];
  sourcesTitle?: string;
  sourceTypeStrings?: WorkspaceSourceTypeLabels | undefined;
  status: ArticleStatus;
  statusNode?: ReactNode;
  title: ReactNode;
  updatedAt?: Date | null;
  variant?: 'article' | 'doc-editor';
};

export type KnowledgeArtifactSourceReference = {
  chunkId: string;
  citationIndex: number;
  documentId: string;
  path: string;
  sourceMetadata?: JsonValue;
  sourceName: string;
  sourceType: WorkspaceSourceType;
  title: string;
};

type KnowledgeArtifactSourceHrefContext = {
  areaId?: string | null | undefined;
  articleId?: string | null | undefined;
  vaultId?: string | null | undefined;
  vaultSlug?: string | null | undefined;
};

type KnowledgeArtifactSourceHref = Route | `#source-${number}`;

type ArticleCoverTone = {
  containerClassName: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type ArticleCoverPattern = {
  firstDocumentClassName: string;
  iconClassName: string;
  secondDocumentClassName: string;
};

const articleCoverTones = {
  approved: {
    containerClassName:
      'border-[var(--success-border)] bg-[var(--success-muted)] text-[var(--success-foreground)]',
    icon: CheckCircle2,
  },
  deprecated: {
    containerClassName:
      'border-[var(--danger-border)] bg-[var(--danger-muted)] text-[var(--danger-foreground)]',
    icon: Archive,
  },
  draft: {
    containerClassName:
      'border-[var(--info-border)] bg-[var(--info-muted)] text-[var(--info-foreground)]',
    icon: FileText,
  },
  'in-review': {
    containerClassName: 'border-[var(--border)] bg-[var(--muted)] text-[var(--primary)]',
    icon: Clock3,
  },
  'needs-update': {
    containerClassName:
      'border-[var(--warning-border)] bg-[var(--warning-muted)] text-[var(--warning-foreground)]',
    icon: AlertTriangle,
  },
} satisfies Record<ArticleStatus, ArticleCoverTone>;

const articleCoverPatterns = [
  {
    firstDocumentClassName: 'left-4 top-9 -rotate-3',
    iconClassName: 'bottom-4 right-7',
    secondDocumentClassName: 'left-20 top-3 rotate-2',
  },
  {
    firstDocumentClassName: 'left-8 top-5 rotate-2',
    iconClassName: 'bottom-3 right-12',
    secondDocumentClassName: 'left-24 top-10 -rotate-2',
  },
  {
    firstDocumentClassName: 'left-2 top-12 -rotate-2',
    iconClassName: 'bottom-6 right-4',
    secondDocumentClassName: 'left-16 top-1 rotate-3',
  },
] satisfies [ArticleCoverPattern, ...ArticleCoverPattern[]];

function getCoverPattern(seed: string | null): ArticleCoverPattern {
  if (!seed) {
    return articleCoverPatterns[0];
  }

  const patternIndex =
    Array.from(seed).reduce((hash, character) => hash + character.charCodeAt(0), 0) %
    articleCoverPatterns.length;

  return articleCoverPatterns[patternIndex] ?? articleCoverPatterns[0];
}

export function createKnowledgeArtifactSourceHref(
  source: KnowledgeArtifactSourceReference,
  context: KnowledgeArtifactSourceHrefContext,
): KnowledgeArtifactSourceHref {
  if (!context.vaultId) {
    return `#source-${source.citationIndex}`;
  }

  return createVaultDocumentHref({
    areaId: context.areaId,
    articleId: context.articleId,
    documentId: source.documentId,
    vaultId: context.vaultId,
    vaultSlug: context.vaultSlug,
  });
}

export function createKnowledgeArtifactCitationHrefByIndex(
  sourceReferences: KnowledgeArtifactSourceReference[],
  context: KnowledgeArtifactSourceHrefContext,
): Record<number, string> {
  return Object.fromEntries(
    sourceReferences.map((source) => [
      source.citationIndex,
      createKnowledgeArtifactSourceHref(source, context),
    ]),
  );
}

function readMetadataString(metadata: JsonValue | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];

  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isRelativeMarkdownImageSrc(src: string): boolean {
  const trimmedSrc = src.trim();

  if (!trimmedSrc || trimmedSrc.startsWith('#') || trimmedSrc.startsWith('//')) {
    return false;
  }

  try {
    new URL(trimmedSrc);

    return false;
  } catch {
    return true;
  }
}

function encodePathSegments(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function resolveGitHubRawImageSrc({
  source,
  src,
}: {
  source: KnowledgeArtifactSourceReference;
  src: string;
}): null | string {
  if (source.sourceType !== 'github' || !isRelativeMarkdownImageSrc(src)) {
    return null;
  }

  const owner = readMetadataString(source.sourceMetadata, 'owner');
  const repo = readMetadataString(source.sourceMetadata, 'repo');
  const ref =
    readMetadataString(source.sourceMetadata, 'commitSha') ??
    readMetadataString(source.sourceMetadata, 'branch');

  if (!owner || !repo || !ref) {
    return null;
  }

  const sourceDirectory = source.path.includes('/')
    ? source.path.slice(0, source.path.lastIndexOf('/'))
    : '';
  const imagePath = src.startsWith('/')
    ? src.slice(1)
    : `${sourceDirectory}/${src}`.replace(/^\/+/u, '');
  const normalizedImagePath = imagePath.split('/').reduce<string[]>((segments, segment) => {
    if (!segment || segment === '.') {
      return segments;
    }

    if (segment === '..') {
      return segments.slice(0, -1);
    }

    return [...segments, segment];
  }, []);

  if (normalizedImagePath.length === 0) {
    return null;
  }

  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo,
  )}/${encodeURIComponent(ref)}/${encodePathSegments(normalizedImagePath.join('/'))}`;
}

export function createKnowledgeArtifactImageSrcResolver(
  sourceReferences: KnowledgeArtifactSourceReference[],
): (src: string) => null | string {
  return (src) => {
    for (const source of sourceReferences) {
      const resolvedSrc = resolveGitHubRawImageSrc({ source, src });

      if (resolvedSrc) {
        return resolvedSrc;
      }
    }

    return null;
  };
}

export function getArticleStatusLabel(
  status: ArticleStatus,
  strings: Dictionary['articles']['statuses'],
): string {
  const labels = {
    approved: strings.approved,
    deprecated: strings.deprecated,
    draft: strings.draft,
    'in-review': strings.inReview,
    'needs-update': strings.needsUpdate,
  } satisfies Record<ArticleStatus, string>;

  return labels[status];
}

export function getArticleStatusVariant(status: ArticleStatus) {
  if (status === 'approved') {
    return 'success';
  }

  if (status === 'deprecated' || status === 'needs-update') {
    return 'warning';
  }

  return 'muted';
}

function ArticleCover({ seed, status }: { seed: string | null; status: ArticleStatus }) {
  const coverTone = articleCoverTones[status];
  const coverPattern = getCoverPattern(seed);
  const StatusIcon = coverTone.icon;

  return (
    <div
      className={cn(
        'flex min-h-48 items-center justify-center overflow-hidden rounded-lg border px-6 py-8',
        coverTone.containerClassName,
      )}
    >
      <div className="relative h-32 w-64 max-w-full" aria-hidden="true">
        <span
          className={cn(
            'absolute h-20 w-28 rounded-md border border-current/25 bg-white/75 p-3 shadow-sm',
            coverPattern.firstDocumentClassName,
          )}
        >
          <span className="mb-3 block h-2 w-14 rounded-sm bg-current/25" />
          <span className="mb-2 block h-1.5 w-20 rounded-sm bg-current/20" />
          <span className="block h-1.5 w-16 rounded-sm bg-current/20" />
        </span>
        <span
          className={cn(
            'absolute h-24 w-32 rounded-md border border-current/25 bg-white/85 p-3 shadow-sm',
            coverPattern.secondDocumentClassName,
          )}
        >
          <span className="mb-3 block h-2 w-16 rounded-sm bg-current/25" />
          <span className="mb-2 block h-1.5 w-24 rounded-sm bg-current/20" />
          <span className="mb-2 block h-1.5 w-20 rounded-sm bg-current/20" />
          <span className="block h-1.5 w-14 rounded-sm bg-current/20" />
        </span>
        <span
          className={cn(
            'absolute flex size-16 items-center justify-center rounded-md border border-current/25 bg-white/90 shadow-sm',
            coverPattern.iconClassName,
          )}
        >
          <StatusIcon className="size-8" />
        </span>
      </div>
    </div>
  );
}

export function ArticleDocumentLayout({
  actions,
  areaId = null,
  areaName = null,
  articleId = null,
  children,
  footer = null,
  locale,
  noSourcesLabel = '',
  preTitle = null,
  sourceReferences = [],
  sourcesTitle = '',
  sourceTypeStrings,
  status,
  statusNode,
  title,
  updatedAt,
  variant = 'article',
  vaultId = null,
  vaultSlug = null,
}: ArticleDocumentLayoutProps) {
  const formattedUpdatedAt = updatedAt ? formatDateTime(updatedAt, locale) : null;
  const isDocEditor = variant === 'doc-editor';
  const fallbackFooter =
    footer === false ? null : (
      <footer className="article-document-main mx-auto mt-12 max-w-[var(--article-document-content-width)] border-t border-[var(--border)] pt-8">
        <section aria-labelledby="article-sources-heading" className="grid gap-3">
          <h2
            className="text-sm font-semibold text-[var(--foreground)]"
            id="article-sources-heading"
          >
            {sourcesTitle}
          </h2>
          {sourceReferences.length > 0 ? (
            <ul className="grid gap-2">
              {sourceReferences.map((source) => {
                const sourceHref = createKnowledgeArtifactSourceHref(source, {
                  areaId,
                  articleId,
                  vaultId,
                  vaultSlug,
                });
                const sourceContent = (
                  <>
                    <FileText
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[var(--primary)]"
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium text-[var(--foreground)]">
                        [{source.citationIndex}] {source.title || source.path}
                      </span>
                      <span className="truncate text-xs text-[var(--muted-foreground)]">
                        {getWorkspaceSourceTypeLabel(source.sourceType, sourceTypeStrings)} ·{' '}
                        {source.sourceName}
                      </span>
                      <span className="truncate text-xs text-[var(--muted-foreground)]">
                        {source.path}
                      </span>
                    </span>
                  </>
                );

                return (
                  <li
                    id={`source-${source.citationIndex}`}
                    key={`${source.citationIndex}-${source.chunkId}-${source.path}`}
                  >
                    {vaultId ? (
                      <Link
                        className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm transition hover:border-[var(--primary)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        href={sourceHref}
                      >
                        {sourceContent}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                        {sourceContent}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm leading-6 text-[var(--muted-foreground)]">{noSourcesLabel}</p>
          )}
        </section>
      </footer>
    );

  return (
    <article className="article-document-layout mx-auto max-w-6xl pb-12">
      {actions ? (
        <div
          className={cn(
            'mb-5 flex flex-wrap items-center justify-between gap-2',
            isDocEditor &&
              'article-document-main mx-auto max-w-[var(--article-document-content-width)]',
          )}
        >
          {actions}
        </div>
      ) : null}

      {isDocEditor ? null : <ArticleCover seed={areaName} status={status} />}

      <header className="article-document-main mx-auto mt-8 max-w-[var(--article-document-content-width)]">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
          {statusNode}
          {areaName ? <span>{areaName}</span> : null}
          {sourcesTitle ? (
            <span>
              {sourcesTitle}: {sourceReferences.length}
            </span>
          ) : null}
          {updatedAt ? <time dateTime={updatedAt.toISOString()}>{formattedUpdatedAt}</time> : null}
        </div>
        {preTitle ? <div className={isDocEditor ? 'mt-4' : 'mt-4'}>{preTitle}</div> : null}
        <div
          className={cn(
            isDocEditor ? 'pt-1' : '',
            preTitle ? (isDocEditor ? 'mt-3' : 'mt-4') : isDocEditor ? 'mt-5' : 'mt-4',
          )}
        >
          {title}
        </div>
      </header>

      <div
        className={cn(
          'article-document-main mx-auto max-w-[var(--article-document-content-width)]',
          isDocEditor ? 'mt-1' : 'mt-8',
        )}
      >
        {children}
      </div>

      {footer === undefined || footer === null ? fallbackFooter : footer}
    </article>
  );
}

export function ArticleRenderer({
  actions,
  areaName = null,
  article,
  locale,
  sourceTypeStrings,
  strings,
  vaultSlug = null,
}: ArticleRendererProps) {
  const statusLabel = getArticleStatusLabel(article.status, strings.statuses);

  return (
    <ArticleDocumentLayout
      actions={actions}
      articleId={article.id}
      areaId={article.workspaceAreaId}
      areaName={areaName}
      locale={locale}
      noSourcesLabel={strings.noSources}
      vaultId={article.vaultId}
      vaultSlug={vaultSlug}
      sourceReferences={article.sourceReferences}
      sourcesTitle={strings.sourcesTitle}
      sourceTypeStrings={sourceTypeStrings}
      status={article.status}
      statusNode={<Badge variant={getArticleStatusVariant(article.status)}>{statusLabel}</Badge>}
      title={
        <h1 className="break-words text-3xl font-semibold leading-tight text-[var(--foreground)]">
          {article.question}
        </h1>
      }
      updatedAt={article.updatedAt}
    >
      <MarkdownContent
        citationHrefByIndex={createKnowledgeArtifactCitationHrefByIndex(article.sourceReferences, {
          areaId: article.workspaceAreaId,
          articleId: article.id,
          vaultId: article.vaultId,
          vaultSlug,
        })}
        content={article.content}
        imageSrcResolver={createKnowledgeArtifactImageSrcResolver(article.sourceReferences)}
        variant="document"
      />
    </ArticleDocumentLayout>
  );
}
