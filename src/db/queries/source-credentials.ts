import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { sourceCredentials } from '@/db/schema';
import {
  decryptSourceCredentialSecret,
  encryptSourceCredentialSecret,
  SourceCredentialCryptoError,
} from '@/lib/security/source-credential-crypto';

import type { Db } from '@/db';
import type { SourceCredential, WorkspaceSourceType } from '@/db/schema';
import type { SourceCredentialSecret } from '@/lib/sources/types';

export class SourceCredentialError extends Error {
  code: 'source-credential-decryption-failed' | 'source-credential-key-missing';
  status: number;

  constructor(code: SourceCredentialError['code'], message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function toSourceCredentialError(error: SourceCredentialCryptoError): SourceCredentialError {
  if (error.code === 'credential-encryption-key-missing') {
    return new SourceCredentialError(
      'source-credential-key-missing',
      'Set SOURCE_CREDENTIAL_ENCRYPTION_KEY before using external source credentials.',
      500,
    );
  }

  return new SourceCredentialError(
    'source-credential-decryption-failed',
    'Source credentials could not be decrypted. Reconnect this source and try again.',
    401,
  );
}

function decryptCredential(row: SourceCredential): SourceCredentialSecret {
  try {
    return {
      accessToken: decryptSourceCredentialSecret(row.encryptedAccessToken),
      expiresAt: row.expiresAt,
      refreshToken: row.encryptedRefreshToken
        ? decryptSourceCredentialSecret(row.encryptedRefreshToken)
        : null,
    };
  } catch (error: unknown) {
    if (error instanceof SourceCredentialCryptoError) {
      throw toSourceCredentialError(error);
    }

    throw error;
  }
}

export async function getSourceCredentialSecret(input: {
  db?: Db;
  sourceId: string;
}): Promise<SourceCredentialSecret | null> {
  const db = input.db ?? getDb();
  const [credential] = await db
    .select()
    .from(sourceCredentials)
    .where(eq(sourceCredentials.sourceId, input.sourceId))
    .limit(1);

  return credential ? decryptCredential(credential) : null;
}

export async function deleteSourceCredential(input: { db?: Db; sourceId: string }): Promise<void> {
  const db = input.db ?? getDb();

  await db.delete(sourceCredentials).where(eq(sourceCredentials.sourceId, input.sourceId));
}

export async function upsertSourceCredential(input: {
  accessToken: string;
  accountId?: string | null;
  accountName?: string | null;
  db?: Db;
  expiresAt?: Date | null;
  provider: WorkspaceSourceType;
  refreshToken?: string | null;
  scopes?: string[];
  sourceId: string;
}): Promise<SourceCredential> {
  const db = input.db ?? getDb();
  const encryptedAccessToken = encryptSourceCredentialSecret(input.accessToken);
  const encryptedRefreshToken = input.refreshToken
    ? encryptSourceCredentialSecret(input.refreshToken)
    : null;
  const now = new Date();
  const [credential] = await db
    .insert(sourceCredentials)
    .values({
      accountId: input.accountId ?? null,
      accountName: input.accountName ?? null,
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt: input.expiresAt ?? null,
      provider: input.provider,
      scopes: input.scopes ?? [],
      sourceId: input.sourceId,
    })
    .onConflictDoUpdate({
      set: {
        accountId: input.accountId ?? null,
        accountName: input.accountName ?? null,
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt: input.expiresAt ?? null,
        scopes: input.scopes ?? [],
        updatedAt: now,
      },
      target: sourceCredentials.sourceId,
    })
    .returning();

  if (!credential) {
    throw new Error('Source credential write failed.');
  }

  return credential;
}
