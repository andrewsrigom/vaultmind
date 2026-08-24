import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { IconFrame } from '@/components/icon-frame';
import { Heading, Paragraph } from '@/components/ui/typography';
import { createWorkspaceIndexHref } from '@/lib/routes';
import { WorkspaceAreaIcon } from '@/lib/workspace-area-icons';

import type { WorkspaceAreaIconName } from '@/db/schema';
import type { Dictionary } from '@/lib/i18n';

export type AreaCardItem = {
  description: string | null;
  icon: WorkspaceAreaIconName;
  id: string;
  name: string;
  slug: string;
};

type AreaCardProps = {
  area: AreaCardItem;
  vaultId: string | null;
  vaultSlug?: string | null;
  strings: Dictionary['workspaceIndexes']['card'] & {
    common: Dictionary['common'];
  };
};

export function AreaCard({ area, strings, vaultId, vaultSlug }: AreaCardProps) {
  const href = createWorkspaceIndexHref({
    vaultId,
    vaultSlug,
    workspaceIndexId: area.id,
    workspaceIndexSlug: area.slug,
  });

  return (
    <Link
      aria-label={`${strings.common.open} ${area.name}`}
      className="group block cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 transition hover:-translate-y-px hover:border-[var(--primary)] hover:bg-[var(--muted)] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      href={href}
    >
      <article className="flex items-center gap-4">
        <IconFrame radius="md">
          <WorkspaceAreaIcon aria-hidden="true" className="size-5" icon={area.icon} />
        </IconFrame>
        <div className="min-w-0 flex-1">
          <Heading className="truncate" level={2}>
            {area.name}
          </Heading>
          <Paragraph className="mt-2 line-clamp-2">
            {area.description ?? strings.common.noDescription}
          </Paragraph>
        </div>
        <span className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-[var(--foreground)] transition group-hover:text-[var(--primary)]">
          {strings.common.open}
          <ChevronRight
            aria-hidden="true"
            className="size-4 transition group-hover:translate-x-0.5"
          />
        </span>
      </article>
    </Link>
  );
}
