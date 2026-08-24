import { describe, expect, it } from 'vitest';

import { getSourceCredentialEncryptionEnv } from '@/lib/env';

describe('getSourceCredentialEncryptionEnv', () => {
  it('accepts a configured local encryption key', () => {
    expect(
      getSourceCredentialEncryptionEnv({
        NODE_ENV: 'development',
        SOURCE_CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(32),
      }),
    ).toEqual({
      SOURCE_CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(32),
    });
  });

  it('rejects the documented development placeholder in production', () => {
    expect(() =>
      getSourceCredentialEncryptionEnv({
        NODE_ENV: 'production',
        SOURCE_CREDENTIAL_ENCRYPTION_KEY: 'at-least-32-characters-for-local-dev',
      }),
    ).toThrow('must not use a documented development placeholder');
  });
});
