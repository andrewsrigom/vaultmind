import { ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import Link from 'next/link';

import { IconFrame } from '@/components/icon-frame';
import { Badge } from '@/components/ui/badge';
import { Heading, Paragraph, typographyClassNames } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

import type { Dictionary } from '@/lib/i18n';
import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type IntegrationStatus = 'available' | 'connected' | 'unconfigured';

export type IntegrationCardItem = {
  actionHref?: Route;
  actionLabel?: string;
  description: string;
  icon: LucideIcon;
  id: string;
  status: IntegrationStatus;
  title: string;
};

type IntegrationGridProps = {
  children?: ReactNode;
  integrations: IntegrationCardItem[];
  strings: Dictionary['integrations'];
};

type IntegrationCardProps = {
  integration: IntegrationCardItem;
  strings: Dictionary['integrations'];
};

function getStatusLabel(status: IntegrationStatus, strings: Dictionary['integrations']): string {
  if (status === 'connected') {
    return strings.connected;
  }

  if (status === 'available') {
    return strings.available;
  }

  return strings.unconfigured;
}

function getActionLabel(
  integration: IntegrationCardItem,
  strings: Dictionary['integrations'],
): string {
  if (integration.actionLabel) {
    return integration.actionLabel;
  }

  if (integration.status === 'connected') {
    return strings.manage;
  }

  return strings.cta.replace('GitHub', integration.title);
}

function shouldUseBrowserNavigation(actionHref: Route): boolean {
  return actionHref.startsWith('/api/');
}

function IntegrationStatusPill({
  status,
  strings,
}: {
  status: IntegrationStatus;
  strings: Dictionary['integrations'];
}) {
  const isConnected = status === 'connected';
  const variant = isConnected ? 'success' : status === 'available' ? 'default' : 'muted';

  return (
    <Badge className="h-7 gap-1.5 rounded-full" variant={variant}>
      {isConnected ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : null}
      {status === 'unconfigured' ? <Clock3 aria-hidden="true" className="size-3.5" /> : null}
      {getStatusLabel(status, strings)}
    </Badge>
  );
}

function IntegrationCard({ integration, strings }: IntegrationCardProps) {
  const Icon = integration.icon;
  const isActionable = Boolean(integration.actionHref);
  const cardClassName = cn(
    'group flex h-full min-h-52 flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
    isActionable
      ? 'cursor-pointer hover:-translate-y-px hover:border-[var(--primary)] hover:bg-[var(--muted)] hover:shadow-md'
      : 'cursor-not-allowed opacity-75',
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <IconFrame hasBorder size="xl" tone="neutral">
          <Icon aria-hidden="true" className="size-6" />
        </IconFrame>
        <IntegrationStatusPill status={integration.status} strings={strings} />
      </div>

      <div className="mt-5 min-w-0">
        <div className={typographyClassNames.mutedEyebrow}>{strings.categories.source}</div>
        <Heading className="mt-2" level={2} variant="panel">
          {integration.title}
        </Heading>
        <Paragraph className="mt-2">{integration.description}</Paragraph>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm font-medium">
        <span className={isActionable ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}>
          {isActionable ? getActionLabel(integration, strings) : strings.actionSoon}
        </span>
        {isActionable ? (
          <ArrowRight
            aria-hidden="true"
            className="size-4 text-[var(--primary)] transition group-hover:translate-x-0.5"
          />
        ) : null}
      </div>
    </>
  );

  if (integration.actionHref && shouldUseBrowserNavigation(integration.actionHref)) {
    return (
      <a className={cardClassName} href={integration.actionHref}>
        {content}
      </a>
    );
  }

  if (integration.actionHref) {
    return (
      <Link className={cardClassName} href={integration.actionHref}>
        {content}
      </Link>
    );
  }

  return <article className={cardClassName}>{content}</article>;
}

export function IntegrationGrid({ children, integrations, strings }: IntegrationGridProps) {
  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={strings.title}>
      {integrations.map((integration) => (
        <IntegrationCard integration={integration} key={integration.id} strings={strings} />
      ))}
      {children}
    </section>
  );
}
