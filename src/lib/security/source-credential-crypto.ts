import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { getSourceCredentialEncryptionEnv } from '@/lib/env';

const algorithm = 'aes-256-gcm';
const encoding = 'base64url';
const version = 'v1';

export class SourceCredentialCryptoError extends Error {
  code: 'credential-decryption-failed' | 'credential-encryption-key-missing';

  constructor(code: SourceCredentialCryptoError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function getEncryptionKey(): Buffer {
  try {
    const { SOURCE_CREDENTIAL_ENCRYPTION_KEY } = getSourceCredentialEncryptionEnv();

    return createHash('sha256').update(SOURCE_CREDENTIAL_ENCRYPTION_KEY, 'utf8').digest();
  } catch {
    throw new SourceCredentialCryptoError(
      'credential-encryption-key-missing',
      'Set SOURCE_CREDENTIAL_ENCRYPTION_KEY before connecting external sources.',
    );
  }
}

export function encryptSourceCredentialSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    version,
    iv.toString(encoding),
    authTag.toString(encoding),
    encrypted.toString(encoding),
  ].join(':');
}

export function decryptSourceCredentialSecret(encryptedSecret: string): string {
  const [storedVersion, ivValue, authTagValue, encryptedValue] = encryptedSecret.split(':');

  if (storedVersion !== version || !ivValue || !authTagValue || !encryptedValue) {
    throw new SourceCredentialCryptoError(
      'credential-decryption-failed',
      'Source credential could not be decrypted.',
    );
  }

  try {
    const decipher = createDecipheriv(
      algorithm,
      getEncryptionKey(),
      Buffer.from(ivValue, encoding),
    );

    decipher.setAuthTag(Buffer.from(authTagValue, encoding));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, encoding)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new SourceCredentialCryptoError(
      'credential-decryption-failed',
      'Source credential could not be decrypted.',
    );
  }
}
