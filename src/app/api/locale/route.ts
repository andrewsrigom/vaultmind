import { apiError, apiSuccess } from '@/lib/api/responses';
import { readJsonBody } from '@/lib/api/request';
import { localeCookieName, localeSchema } from '@/lib/i18n';

import type { NextRequest } from 'next/server';

const updateLocaleSchema = localeSchema;

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  const parsedBody = updateLocaleSchema.safeParse(
    body && typeof body === 'object' && 'locale' in body ? body.locale : undefined,
  );

  if (!parsedBody.success) {
    return apiError('invalid-input', 'Locale must be pt-BR or en.', 400);
  }

  const response = apiSuccess({ locale: parsedBody.data });

  response.cookies.set(localeCookieName, parsedBody.data, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
  });

  return response;
}
