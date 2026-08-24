import { redirect } from 'next/navigation';

import { defaultVaultId, defaultVaultSlug } from '@/db/schema';
import { createVaultAskHref } from '@/lib/routes';

export default function HomePage() {
  redirect(
    createVaultAskHref({
      vaultId: defaultVaultId,
      vaultSlug: defaultVaultSlug,
    }),
  );
}
