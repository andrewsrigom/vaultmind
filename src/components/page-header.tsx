import type { ReactNode } from 'react';

import { Eyebrow, Heading, Paragraph } from '@/components/ui/typography';

type PageHeaderProps = {
  actions?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
};

export function PageHeader({ actions, description, eyebrow, title }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <Heading level={1} variant="page">
          {title}
        </Heading>
        {description ? <Paragraph className="mt-2 max-w-2xl">{description}</Paragraph> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
