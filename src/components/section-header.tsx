import type { ReactNode } from 'react';

import {
  Heading,
  Paragraph,
  type HeadingLevel,
  type HeadingVariant,
} from '@/components/ui/typography';
import { cn } from '@/lib/utils';

type SectionHeaderProps = {
  className?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  headingLevel?: HeadingLevel;
  title: ReactNode;
  titleClassName?: string;
  titleVariant?: HeadingVariant;
};

export function SectionHeader({
  className,
  description,
  descriptionClassName,
  headingLevel = 2,
  title,
  titleClassName,
  titleVariant = 'section',
}: SectionHeaderProps) {
  return (
    <div className={cn('grid gap-1', className)}>
      <Heading className={titleClassName} level={headingLevel} variant={titleVariant}>
        {title}
      </Heading>
      {description ? <Paragraph className={descriptionClassName}>{description}</Paragraph> : null}
    </div>
  );
}
