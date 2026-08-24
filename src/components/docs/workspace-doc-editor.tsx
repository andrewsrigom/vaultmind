'use client';

import {
  Archive,
  ArchiveRestore,
  BrainCircuit,
  Check,
  Cloud,
  FileText,
  Globe2,
  Loader2,
  UploadCloud,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { ArticleDocumentLayout } from '@/components/articles/article-renderer';
import { MarkdownBlockEditor } from '@/components/editor/markdown-block-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createVaultDocHref } from '@/lib/routes';
import { cn } from '@/lib/utils';
import {
  getStoredWorkspaceDocSubpathButtonsHidden,
  subscribeWorkspaceDocEditorLayoutChange,
} from '@/lib/workspace-doc-editor-layout';

import type { WorkspaceDocDetail } from '@/db/queries/workspace-docs';
import type { ArticleStatus, WorkspaceDoc, WorkspaceDocStatus } from '@/db/schema';
import type { Dictionary, Locale } from '@/lib/i18n';

type WorkspaceDocEditorProps = {
  canEdit?: boolean;
  canRestoreArchivedDoc?: boolean;
  doc: WorkspaceDocDetail;
  locale: Locale;
  vaultSlug?: string | null;
  subpathDocs: WorkspaceDocSubpathLink[];
  strings: Dictionary['workspaceDocs'];
};

export type WorkspaceDocSubpathLink = {
  id: string;
  slug: string;
  title: string;
};

type WorkspaceDocMutationResponse =
  | {
      doc: WorkspaceDoc;
      ok: true;
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

function getDocLayoutStatus(status: WorkspaceDocStatus): ArticleStatus {
  const statuses = {
    deprecated: 'deprecated',
    draft: 'draft',
    'in-review': 'in-review',
    'needs-update': 'needs-update',
    open: 'needs-update',
    published: 'approved',
    resolved: 'approved',
  } satisfies Record<WorkspaceDocStatus, ArticleStatus>;

  return statuses[status];
}

function getPublicationBadgeVariant({
  hasUnpublishedChanges,
  isPublished,
}: {
  hasUnpublishedChanges: boolean;
  isPublished: boolean;
}) {
  if (hasUnpublishedChanges) {
    return 'warning';
  }

  if (isPublished) {
    return 'success';
  }

  return 'muted';
}

function normalizeDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeNullableDate(value: Date | string | null): Date | null {
  return value ? normalizeDate(value) : null;
}

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

function normalizeEditorContent(content: string | null, title: string): string | null {
  return content === null ? null : removeDuplicateTitleHeading(content, title);
}

function WorkspaceDocSubpathButtons({
  doc,
  strings,
  subpathDocs,
  vaultSlug,
}: {
  doc: WorkspaceDocDetail;
  vaultSlug?: string | null;
  strings: Dictionary['workspaceDocs'];
  subpathDocs: WorkspaceDocSubpathLink[];
}) {
  if (subpathDocs.length === 0) {
    return null;
  }

  return (
    <nav aria-label={strings.subdocsTitle} className="flex flex-wrap gap-1.5">
      {subpathDocs.map((subpathDoc) => {
        const href = createVaultDocHref({
          docId: subpathDoc.id,
          docSlug: subpathDoc.slug,
          vaultId: doc.vaultId,
          vaultSlug,
        });

        return (
          <Button
            asChild
            className="h-6 max-w-52 justify-start rounded-md border-[var(--border)] bg-[var(--muted)] px-2 text-xs font-medium text-[var(--muted-foreground)] shadow-none hover:bg-[var(--card)] hover:text-[var(--foreground)]"
            key={subpathDoc.id}
            size="sm"
            variant="outline"
          >
            <Link href={href}>
              <FileText aria-hidden="true" className="size-3" />
              <span className="truncate">{subpathDoc.title}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export function WorkspaceDocEditor({
  canEdit = true,
  canRestoreArchivedDoc = false,
  doc,
  locale,
  strings,
  subpathDocs,
  vaultSlug = null,
}: WorkspaceDocEditorProps) {
  const router = useRouter();
  const currentDocIdRef = useRef(doc.id);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState(() => removeDuplicateTitleHeading(doc.content, doc.title));
  const [includeInAskAi, setIncludeInAskAi] = useState(doc.includeInAskAi);
  const [isRestoringArchivedDoc, setIsRestoringArchivedDoc] = useState(false);
  const [isUpdatingAskAi, setIsUpdatingAskAi] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [publicationAction, setPublicationAction] = useState<'publish' | 'unpublish' | null>(null);
  const [publishedAt, setPublishedAt] = useState<Date | null>(() =>
    normalizeNullableDate(doc.publishedAt),
  );
  const [publishedContent, setPublishedContent] = useState<string | null>(() =>
    normalizeEditorContent(doc.publishedContent, doc.title),
  );
  const [publishedTitle, setPublishedTitle] = useState<string | null>(doc.publishedTitle);
  const [savedContent, setSavedContent] = useState(() =>
    removeDuplicateTitleHeading(doc.content, doc.title),
  );
  const [savedTitle, setSavedTitle] = useState(doc.title);
  const [status, setStatus] = useState<WorkspaceDocStatus>(doc.status);
  const [title, setTitle] = useState(doc.title);
  const [updatedAt, setUpdatedAt] = useState(() => normalizeDate(doc.updatedAt));
  const areSubpathButtonsHidden = useSyncExternalStore(
    subscribeWorkspaceDocEditorLayoutChange,
    getStoredWorkspaceDocSubpathButtonsHidden,
    () => false,
  );
  const trimmedTitle = title.trim();
  const hasChanges = title !== savedTitle || content !== savedContent;
  const isPublished = status === 'published' && Boolean(publishedAt);
  const isUpdatingPublication = publicationAction !== null;
  const isPublishing = publicationAction === 'publish';
  const isUnpublishing = publicationAction === 'unpublish';
  const isArchived = doc.archivedAt !== null;
  const hasUnpublishedChanges =
    isPublished && (title !== (publishedTitle ?? '') || content !== (publishedContent ?? ''));
  useEffect(() => {
    if (currentDocIdRef.current === doc.id) {
      return;
    }

    currentDocIdRef.current = doc.id;
    const nextContent = removeDuplicateTitleHeading(doc.content, doc.title);

    setContent(nextContent);
    setIncludeInAskAi(doc.includeInAskAi);
    setIsUpdatingAskAi(false);
    setLastSavedAt(null);
    setPublishedAt(normalizeNullableDate(doc.publishedAt));
    setPublishedContent(normalizeEditorContent(doc.publishedContent, doc.title));
    setPublishedTitle(doc.publishedTitle);
    setSavedContent(nextContent);
    setSavedTitle(doc.title);
    setStatus(doc.status);
    setTitle(doc.title);
    setUpdatedAt(normalizeDate(doc.updatedAt));
  }, [
    doc.content,
    doc.id,
    doc.includeInAskAi,
    doc.publishedAt,
    doc.publishedContent,
    doc.publishedTitle,
    doc.status,
    doc.title,
    doc.updatedAt,
  ]);

  useEffect(() => {
    const titleTextarea = titleTextareaRef.current;

    if (!titleTextarea) {
      return;
    }

    titleTextarea.style.height = 'auto';
    titleTextarea.style.height = `${titleTextarea.scrollHeight}px`;
  }, [title]);

  const saveDoc = useCallback(async (): Promise<boolean> => {
    if (!canEdit || isSaving || !trimmedTitle) {
      return false;
    }

    const nextContent = content;
    const nextTitle = trimmedTitle;
    const rawTitle = title;

    setIsSaving(true);

    try {
      const response = await fetch(`/api/vault/${doc.vaultId}/docs/${doc.id}`, {
        body: JSON.stringify({
          content: nextContent,
          title: nextTitle,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const payload = (await response.json()) as WorkspaceDocMutationResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      setLastSavedAt(new Date());
      setSavedContent(nextContent);
      setSavedTitle(payload.doc.title);
      setIncludeInAskAi(payload.doc.includeInAskAi);
      setStatus(payload.doc.status);
      setTitle((currentTitle) => (currentTitle === rawTitle ? payload.doc.title : currentTitle));
      setUpdatedAt(normalizeDate(payload.doc.updatedAt));
      return true;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : strings.saveError);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, content, doc.id, doc.vaultId, isSaving, strings.saveError, title, trimmedTitle]);

  useEffect(() => {
    if (!canEdit || !hasChanges || !trimmedTitle) {
      return;
    }

    const saveTimeout = window.setTimeout(() => {
      void saveDoc();
    }, 1500);

    return () => window.clearTimeout(saveTimeout);
  }, [canEdit, hasChanges, saveDoc, trimmedTitle]);

  function syncPublicationState(nextDoc: WorkspaceDoc) {
    setPublishedAt(normalizeNullableDate(nextDoc.publishedAt));
    setPublishedContent(normalizeEditorContent(nextDoc.publishedContent, nextDoc.title));
    setPublishedTitle(nextDoc.publishedTitle);
    setSavedContent(nextDoc.content);
    setSavedTitle(nextDoc.title);
    setIncludeInAskAi(nextDoc.includeInAskAi);
    setStatus(nextDoc.status);
    setUpdatedAt(normalizeDate(nextDoc.updatedAt));
  }

  async function updateAskAiInclusion(nextIncludeInAskAi: boolean) {
    if (!canEdit || isUpdatingAskAi || isSaving || !trimmedTitle) {
      return;
    }

    const previousIncludeInAskAi = includeInAskAi;

    setIncludeInAskAi(nextIncludeInAskAi);
    setIsUpdatingAskAi(true);

    try {
      if (nextIncludeInAskAi && hasChanges) {
        const didSave = await saveDoc();

        if (!didSave) {
          setIncludeInAskAi(previousIncludeInAskAi);
          return;
        }
      }

      const response = await fetch(`/api/vault/${doc.vaultId}/docs/${doc.id}/ask-ai`, {
        body: JSON.stringify({
          includeInAskAi: nextIncludeInAskAi,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
      const payload = (await response.json()) as WorkspaceDocMutationResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      setIncludeInAskAi(payload.doc.includeInAskAi);
      setUpdatedAt(normalizeDate(payload.doc.updatedAt));
      toast.success(payload.doc.includeInAskAi ? strings.askAi.included : strings.askAi.removed);
    } catch (error: unknown) {
      setIncludeInAskAi(previousIncludeInAskAi);
      toast.error(error instanceof Error ? error.message : strings.askAi.error);
    } finally {
      setIsUpdatingAskAi(false);
    }
  }

  async function updatePublication(action: 'publish' | 'unpublish') {
    if (!canEdit || isUpdatingPublication || isSaving || !trimmedTitle) {
      return;
    }

    setPublicationAction(action);

    try {
      if (action === 'publish' && hasChanges) {
        const didSave = await saveDoc();

        if (!didSave) {
          return;
        }
      }

      const response = await fetch(`/api/vault/${doc.vaultId}/docs/${doc.id}/publication`, {
        method: action === 'publish' ? 'POST' : 'DELETE',
      });
      const payload = (await response.json()) as WorkspaceDocMutationResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      syncPublicationState(payload.doc);
      setLastSavedAt(new Date());
      toast.success(
        action === 'publish' ? strings.publication.published : strings.publication.unpublished,
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : strings.publication.error);
    } finally {
      setPublicationAction(null);
    }
  }

  async function restoreArchivedDoc() {
    if (!canRestoreArchivedDoc || isRestoringArchivedDoc || !isArchived) {
      return;
    }

    setIsRestoringArchivedDoc(true);

    try {
      const response = await fetch(`/api/vault/${doc.vaultId}/docs/${doc.id}/archive`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as WorkspaceDocMutationResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      toast.success(strings.unarchived);
      router.refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : strings.unarchiveError);
    } finally {
      setIsRestoringArchivedDoc(false);
    }
  }

  function getAutosaveLabel(): string {
    if (isSaving) {
      return strings.autosave.saving;
    }

    if (hasChanges) {
      return strings.autosave.pending;
    }

    if (lastSavedAt) {
      return strings.autosave.saved;
    }

    return strings.autosave.ready;
  }

  const AutosaveIcon = isSaving ? Loader2 : hasChanges ? Cloud : Check;
  const publicationLabel = hasUnpublishedChanges
    ? strings.publication.unpublishedChanges
    : isPublished
      ? strings.publication.publishedStatus
      : strings.publication.draftStatus;
  const publishButtonLabel = isPublished
    ? strings.publication.publishChanges
    : strings.publication.publish;
  const statusBadge = isArchived ? (
    <Badge className="gap-1.5" variant="warning">
      <Archive aria-hidden="true" className="size-3" />
      {strings.archivedBadge}
    </Badge>
  ) : (
    <Badge
      variant={getPublicationBadgeVariant({
        hasUnpublishedChanges,
        isPublished,
      })}
    >
      {publicationLabel}
    </Badge>
  );

  return (
    <ArticleDocumentLayout
      actions={
        canEdit ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5">
              {isUpdatingAskAi ? (
                <Loader2
                  aria-hidden="true"
                  className="size-3.5 animate-spin text-[var(--muted-foreground)]"
                />
              ) : (
                <BrainCircuit
                  aria-hidden="true"
                  className="size-3.5 text-[var(--muted-foreground)]"
                />
              )}
              <Label
                className="cursor-pointer text-xs font-medium text-[var(--foreground)]"
                htmlFor={`workspace-doc-ask-ai-${doc.id}`}
              >
                {strings.askAi.label}
              </Label>
              <Switch
                checked={includeInAskAi}
                disabled={isUpdatingAskAi || isSaving || !trimmedTitle}
                id={`workspace-doc-ask-ai-${doc.id}`}
                onCheckedChange={(checked) => void updateAskAiInclusion(checked)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <AutosaveIcon
                aria-hidden="true"
                className={isSaving ? 'size-3.5 animate-spin' : 'size-3.5'}
              />
              <span>{getAutosaveLabel()}</span>
            </div>
            {isPublished ? (
              <>
                {hasUnpublishedChanges ? (
                  <Button
                    disabled={isUpdatingPublication || isSaving || !trimmedTitle}
                    onClick={() => void updatePublication('publish')}
                    size="sm"
                    type="button"
                  >
                    {isPublishing ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <UploadCloud aria-hidden="true" className="size-4" />
                    )}
                    {publishButtonLabel}
                  </Button>
                ) : null}
                <Button
                  disabled={isUpdatingPublication}
                  onClick={() => void updatePublication('unpublish')}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isUnpublishing ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Globe2 aria-hidden="true" className="size-4" />
                  )}
                  {strings.publication.unpublish}
                </Button>
              </>
            ) : (
              <Button
                disabled={isUpdatingPublication || isSaving || !trimmedTitle}
                onClick={() => void updatePublication('publish')}
                size="sm"
                type="button"
              >
                {isPublishing ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <UploadCloud aria-hidden="true" className="size-4" />
                )}
                {publishButtonLabel}
              </Button>
            )}
          </div>
        ) : (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Badge variant={isArchived ? 'warning' : 'muted'}>
              {isArchived ? strings.archivedBadge : strings.readOnly}
            </Badge>
          </div>
        )
      }
      areaName={doc.areaName}
      footer={false}
      locale={locale}
      preTitle={
        areSubpathButtonsHidden ? null : (
          <WorkspaceDocSubpathButtons
            doc={doc}
            vaultSlug={vaultSlug}
            strings={strings}
            subpathDocs={subpathDocs}
          />
        )
      }
      status={getDocLayoutStatus(status)}
      statusNode={statusBadge}
      title={
        canEdit ? (
          <Label className="grid gap-2">
            <span className="sr-only">{strings.titleLabel}</span>
            <Textarea
              className="min-h-[3.75rem] resize-none overflow-hidden border-0 !bg-transparent p-0 !text-4xl font-semibold leading-tight shadow-none outline-none placeholder:text-[var(--muted-foreground)] placeholder:opacity-60 focus-visible:ring-0 md:!text-5xl"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={strings.titlePlaceholder}
              ref={titleTextareaRef}
              rows={1}
              value={title}
            />
          </Label>
        ) : (
          <h1 className="break-words text-4xl font-semibold leading-tight text-[var(--foreground)] md:text-5xl">
            {title}
          </h1>
        )
      }
      updatedAt={updatedAt}
      variant="doc-editor"
    >
      <section aria-labelledby="workspace-doc-editor-content" className="grid gap-2">
        <h2 className="sr-only" id="workspace-doc-editor-content">
          {strings.contentLabel}
        </h2>
        {canEdit ? null : (
          <div
            className={cn(
              'mb-3 flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
              isArchived
                ? 'border-[var(--warning-border)] bg-[var(--warning-muted)] text-[var(--warning-foreground)]'
                : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {isArchived ? <Archive aria-hidden="true" className="size-4 shrink-0" /> : null}
              <p className="min-w-0 leading-5">
                {isArchived ? strings.archivedReadOnly : strings.readOnlyDescription}
              </p>
            </div>
            {isArchived && canRestoreArchivedDoc ? (
              <Button
                className="w-full shrink-0 sm:w-auto"
                disabled={isRestoringArchivedDoc}
                onClick={() => void restoreArchivedDoc()}
                size="sm"
                type="button"
                variant="outline"
              >
                {isRestoringArchivedDoc ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <ArchiveRestore aria-hidden="true" className="size-4" />
                )}
                {isRestoringArchivedDoc ? strings.unarchiving : strings.unarchive}
              </Button>
            ) : null}
          </div>
        )}
        <MarkdownBlockEditor
          className="rounded-none"
          content={content}
          editable={canEdit}
          minHeightClassName="min-h-[24rem]"
          onMarkdownChange={setContent}
          variant="document"
        />
      </section>
    </ArticleDocumentLayout>
  );
}
