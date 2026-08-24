import { Database, KeyRound, LockKeyhole, PlugZap } from 'lucide-react';

import { LockVaultButton } from '@/components/access/lock-vault-button';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getVaultByIdOrSlug } from '@/db/queries/vaults';
import { defaultVaultId } from '@/db/schema';
import { isLocalAccessEnabled } from '@/lib/access/local-access';

type SettingsPageSearchParams = {
  vaultId?: string;
};

type RenderSettingsPageInput = {
  vaultId?: string | null;
  searchParams: Promise<SettingsPageSearchParams>;
};

function ConfigurationStatus({ configured, label }: { configured: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-3 last:border-b-0">
      <span className="text-sm text-[var(--foreground)]">{label}</span>
      <Badge variant={configured ? 'success' : 'outline'}>
        {configured ? 'Configured' : 'Optional'}
      </Badge>
    </div>
  );
}

export async function renderSettingsPage({
  searchParams,
  vaultId: routeVaultId = null,
}: RenderSettingsPageInput) {
  const resolvedSearchParams = await searchParams;
  const vaultIdentifier = routeVaultId ?? resolvedSearchParams.vaultId ?? defaultVaultId;
  const vault = await getVaultByIdOrSlug(vaultIdentifier).catch(() => null);
  const activeVaultId = vault?.id ?? defaultVaultId;
  const accessLockEnabled = isLocalAccessEnabled();

  return (
    <AppShell activeVaultId={activeVaultId} currentPageLabel="Settings">
      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <header>
          <p className="text-sm font-medium text-[var(--primary)]">Personal vault</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Local settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Review the services used by this personal VaultMind instance.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database aria-hidden="true" className="size-5 text-[var(--primary)]" />
                <CardTitle>Storage</CardTitle>
              </div>
              <CardDescription>
                Documents, chunks, embeddings, answers, and citations stay in your PostgreSQL
                database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigurationStatus
                configured={Boolean(process.env.DATABASE_URL?.trim())}
                label="PostgreSQL connection"
              />
              <ConfigurationStatus
                configured={Boolean(process.env.OPENAI_API_KEY?.trim())}
                label="OpenAI provider"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <LockKeyhole aria-hidden="true" className="size-5 text-[var(--primary)]" />
                <CardTitle>Local protection</CardTitle>
              </div>
              <CardDescription>
                Source credentials are encrypted before storage. The optional access password
                protects the web interface; it does not encrypt the PostgreSQL database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigurationStatus
                configured={Boolean(process.env.SOURCE_CREDENTIAL_ENCRYPTION_KEY?.trim())}
                label="Credential encryption key"
              />
              <ConfigurationStatus configured={accessLockEnabled} label="Access password" />
              {accessLockEnabled ? (
                <div className="pt-4">
                  <LockVaultButton />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <PlugZap aria-hidden="true" className="size-5 text-[var(--primary)]" />
                <CardTitle>Personal integrations</CardTitle>
              </div>
              <CardDescription>
                Connect only the knowledge sources you want VaultMind to index.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {[
                ['GitHub', Boolean(process.env.GITHUB_TOKEN?.trim())],
                ['Notion', Boolean(process.env.NOTION_OAUTH_CLIENT_ID?.trim())],
                ['Google Drive', Boolean(process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim())],
              ].map(([label, configured]) => (
                <div
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-3"
                  key={String(label)}
                >
                  <KeyRound aria-hidden="true" className="size-4 text-[var(--muted-foreground)]" />
                  <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                  <Badge variant={configured ? 'success' : 'outline'}>
                    {configured ? 'Ready' : 'Optional'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SettingsPageSearchParams>;
}) {
  return renderSettingsPage({ searchParams });
}
