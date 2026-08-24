'use client';

import { ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { IconFrame } from '@/components/icon-frame';
import { Heading, Paragraph } from '@/components/ui/typography';
import { createVaultChatHref } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { WorkspaceAreaIcon } from '@/lib/workspace-area-icons';

import type { WorkspaceAreaIconName } from '@/db/schema';
import type { WorkspaceIndexKpiSummary } from '@/db/queries/knowledge-events';
import type { Dictionary } from '@/lib/i18n';
import type { ReactNode } from 'react';

type WorkspaceWorkspaceIndex = {
  chunkCount: number;
  description: string | null;
  documentCount: number;
  id: string;
  icon: WorkspaceAreaIconName;
  kpiSummary: WorkspaceIndexKpiSummary;
  lastSyncedAt: string | null;
  name: string;
  sourceCount: number;
  syncedSourceCount: number;
};

type KnowledgeWorkspaceOverviewProps = {
  chatInput: ReactNode;
  disabledReason: string | null;
  vaultId: string | null;
  vaultSlug?: string | null;
  workspaceIndex: WorkspaceWorkspaceIndex | null;
  workspaceIndexes: WorkspaceWorkspaceIndex[];
  strings: Dictionary['chat']['interface']['workspace'];
};

function formatCount(count: number, label: string): string {
  return `${count} ${label}`;
}

type WorkspaceAreaCardProps = {
  isActive: boolean;
  vaultId: string | null;
  vaultSlug?: string | null;
  strings: Dictionary['chat']['interface']['workspace'];
  workspaceIndex: WorkspaceWorkspaceIndex;
};

function WorkspaceAreaCard({
  isActive,
  strings,
  vaultId,
  vaultSlug,
  workspaceIndex,
}: WorkspaceAreaCardProps) {
  const href = createVaultChatHref({
    areaId: workspaceIndex.id,
    vaultId,
    vaultSlug,
  });

  return (
    <Link
      aria-label={`${strings.areaCards.action}: ${workspaceIndex.name}`}
      className={cn(
        'group flex min-h-48 flex-col rounded-lg border bg-[var(--card)] p-5 shadow-sm transition hover:-translate-y-px hover:border-[var(--primary)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
        isActive
          ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]'
          : 'border-[var(--border)]',
      )}
      href={href}
    >
      <IconFrame size="lg">
        <WorkspaceAreaIcon aria-hidden="true" className="size-5" icon={workspaceIndex.icon} />
      </IconFrame>
      <div className="mt-5 min-w-0 flex-1">
        <Heading className="line-clamp-2 leading-6" level={3}>
          {workspaceIndex.name}
        </Heading>
        <Paragraph className="mt-2 line-clamp-3">
          {workspaceIndex.description ?? strings.scopeDescriptionFallback}
        </Paragraph>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
        <span className="rounded-md bg-[var(--muted)] px-2 py-1">
          {formatCount(workspaceIndex.documentCount, strings.documents)}
        </span>
        <span className="rounded-md bg-[var(--muted)] px-2 py-1">
          {formatCount(workspaceIndex.chunkCount, strings.chunks)}
        </span>
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)]">
        {strings.areaCards.action}
        <ArrowRight aria-hidden="true" className="size-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function KnowledgeWorkspaceOverview({
  chatInput,
  disabledReason,
  strings,
  vaultId,
  vaultSlug,
  workspaceIndex,
  workspaceIndexes,
}: KnowledgeWorkspaceOverviewProps) {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8 px-1 py-4 lg:py-8">
      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="bg-[var(--sidebar)] px-4 py-9 text-center text-[var(--sidebar-foreground)] sm:px-8 lg:px-14 lg:py-12">
          <header className="mx-auto grid max-w-3xl gap-3">
            <div className="mx-auto flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--sidebar-muted-foreground)]">
              <ShieldCheck aria-hidden="true" className="size-4 text-[var(--primary-foreground)]" />
              <span>{strings.scopeLabel}</span>
              <span className="font-semibold text-[var(--sidebar-foreground)]">
                {workspaceIndex?.name ?? strings.scopeEmpty}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">{strings.title}</h1>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-[var(--sidebar-muted-foreground)]">
              {strings.subtitle}
            </p>
          </header>

          <div className="mx-auto mt-6 w-full max-w-3xl text-left">{chatInput}</div>

          {disabledReason ? (
            <div className="mx-auto mt-4 max-w-3xl rounded-md border border-[var(--warning-border)] bg-[var(--warning-muted)] px-4 py-3 text-left text-sm leading-6 text-[var(--warning-foreground)]">
              {disabledReason}
            </div>
          ) : null}
        </div>
      </section>

      {workspaceIndexes.length > 0 ? (
        <section aria-labelledby="chat-area-cards-title" className="grid gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                className="text-xl font-semibold tracking-normal text-[var(--foreground)]"
                id="chat-area-cards-title"
              >
                {strings.areaCards.title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                {strings.areaCards.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {workspaceIndexes.map((availableWorkspaceIndex) => (
              <WorkspaceAreaCard
                isActive={availableWorkspaceIndex.id === workspaceIndex?.id}
                key={availableWorkspaceIndex.id}
                vaultId={vaultId}
                vaultSlug={vaultSlug ?? null}
                strings={strings}
                workspaceIndex={availableWorkspaceIndex}
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
