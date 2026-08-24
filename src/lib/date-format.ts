import { defaultLocale } from '@/lib/i18n';

import type { Locale } from '@/lib/i18n';

type DateTimeValue = Date | string | null;

export function formatDateTime(value: DateTimeValue, locale: Locale = defaultLocale): string {
  if (!value) {
    return locale === 'pt-BR' ? 'Nunca' : 'Never';
  }

  const date = typeof value === 'string' ? new Date(value) : value;
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return formatter.format(date);
}
