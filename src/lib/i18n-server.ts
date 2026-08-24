import { cookies } from 'next/headers';

import { defaultLocale, isLocale, localeCookieName } from '@/lib/i18n';

import type { Locale } from '@/lib/i18n';

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;

  return isLocale(cookieLocale) ? cookieLocale : defaultLocale;
}
