'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { appendIntegrationsSearchParams } from '@/lib/integration-page-state';

import type { Route } from 'next';

type IntegrationTargetSpace = {
  id: string;
  name: string;
};

type IntegrationTargetSpaceSelectProps = {
  integrationsHref: Route;
  label: string;
  placeholder: string;
  selectedWorkspaceIndexId?: string;
  workspaceIndexes: IntegrationTargetSpace[];
};

export function IntegrationTargetSpaceSelect({
  integrationsHref,
  label,
  placeholder,
  selectedWorkspaceIndexId,
  workspaceIndexes,
}: IntegrationTargetSpaceSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const selectedWorkspaceIndex = workspaceIndexes.find(
    (workspaceIndex) => workspaceIndex.id === selectedWorkspaceIndexId,
  );

  return (
    <section
      aria-labelledby="integration-target-space-heading"
      className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2
            className="text-base font-semibold text-[var(--foreground)]"
            id="integration-target-space-heading"
          >
            {label}
          </h2>
          <p
            aria-live="polite"
            className="mt-1 truncate text-sm text-[var(--muted-foreground)]"
            id="integration-target-space-description"
          >
            {selectedWorkspaceIndex?.name ?? placeholder}
          </p>
        </div>

        <Select
          disabled={isPending || workspaceIndexes.length === 0}
          onValueChange={(workspaceIndexId) => {
            startTransition(() => {
              router.replace(
                appendIntegrationsSearchParams({
                  href: integrationsHref,
                  workspaceIndexId,
                }),
              );
            });
          }}
          value={selectedWorkspaceIndexId ?? ''}
        >
          <SelectTrigger
            aria-busy={isPending}
            aria-describedby="integration-target-space-description"
            aria-label={label}
            className="w-full sm:w-72"
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {workspaceIndexes.map((workspaceIndex) => (
              <SelectItem key={workspaceIndex.id} value={workspaceIndex.id}>
                {workspaceIndex.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
