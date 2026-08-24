import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { UnlockForm } from '@/components/access/unlock-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isLocalAccessEnabled, isLocalAccessGranted } from '@/lib/access/local-access';

import type { Route } from 'next';

type UnlockPageSearchParams = {
  next?: string;
};

function getSafeNextPath(value: string | undefined): string {
  const normalizedValue = value?.trim();

  if (
    !normalizedValue ||
    !normalizedValue.startsWith('/') ||
    normalizedValue.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/u.test(normalizedValue)
  ) {
    return '/';
  }

  return normalizedValue;
}

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<UnlockPageSearchParams>;
}) {
  const nextPath = getSafeNextPath((await searchParams).next);
  const cookieHeader = (await headers()).get('cookie');

  if (!isLocalAccessEnabled() || isLocalAccessGranted(cookieHeader)) {
    redirect(nextPath as Route);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--muted)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-sm font-medium text-[var(--primary)]">VaultMind</p>
          <CardTitle className="text-2xl">Unlock your vault</CardTitle>
          <CardDescription>
            Enter the access password configured by the person who runs this instance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnlockForm nextPath={nextPath} />
        </CardContent>
      </Card>
    </main>
  );
}
