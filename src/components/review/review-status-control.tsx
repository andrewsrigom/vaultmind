'use client';

import { AlertTriangle, BadgeCheck, FilePenLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EditableReviewStatus = 'approved' | 'draft' | 'needs-update';

type ReviewStatusControlLabels = {
  draft: string;
  needsUpdate: string;
  verified: string;
};

type ReviewStatusControlProps = {
  disabled?: boolean;
  label: string;
  labels: ReviewStatusControlLabels;
  onChange: (status: EditableReviewStatus) => void;
  value: EditableReviewStatus;
};

const reviewStatusOptions = [
  {
    icon: FilePenLine,
    key: 'draft',
    labelKey: 'draft',
  },
  {
    icon: BadgeCheck,
    key: 'approved',
    labelKey: 'verified',
  },
  {
    icon: AlertTriangle,
    key: 'needs-update',
    labelKey: 'needsUpdate',
  },
] satisfies {
  icon: typeof FilePenLine;
  key: EditableReviewStatus;
  labelKey: keyof ReviewStatusControlLabels;
}[];

export function normalizeReviewStatus(status: string): EditableReviewStatus {
  if (status === 'approved') {
    return 'approved';
  }

  if (status === 'deprecated' || status === 'needs-update') {
    return 'needs-update';
  }

  return 'draft';
}

export function ReviewStatusControl({
  disabled = false,
  label,
  labels,
  onChange,
  value,
}: ReviewStatusControlProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium text-[var(--foreground)]">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {reviewStatusOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = option.key === value;

          return (
            <Button
              aria-pressed={isSelected}
              className={cn(
                'h-10 justify-start px-3',
                isSelected
                  ? 'border-[var(--primary)] bg-[var(--info-muted)] text-[var(--foreground)]'
                  : 'bg-[var(--card)]',
              )}
              disabled={disabled}
              key={option.key}
              onClick={() => {
                onChange(option.key);
              }}
              type="button"
              variant="outline"
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  option.key === 'approved'
                    ? 'text-[var(--success-foreground)]'
                    : option.key === 'needs-update'
                      ? 'text-[var(--warning-foreground)]'
                      : 'text-[var(--muted-foreground)]',
                )}
              />
              {labels[option.labelKey]}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
