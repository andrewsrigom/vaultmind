import { describe, expect, it } from 'vitest';

import {
  createLocalAccessSessionToken,
  getLocalAccessConfiguration,
  hashLocalAccessPassword,
  verifyLocalAccessPassword,
  verifyLocalAccessSessionToken,
} from '@/lib/access/local-access';

describe('local access protection', () => {
  it('is disabled when no password hash is configured', () => {
    expect(getLocalAccessConfiguration({})).toEqual({
      enabled: false,
      passwordHash: null,
    });
  });

  it('hashes and verifies a password without storing the password', async () => {
    const password = 'correct horse battery staple';
    const passwordHash = await hashLocalAccessPassword(password);

    expect(passwordHash).not.toContain(password);
    await expect(verifyLocalAccessPassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyLocalAccessPassword('not-the-password', passwordHash)).resolves.toBe(false);
  });

  it('rejects expired and tampered session tokens', async () => {
    const passwordHash = await hashLocalAccessPassword('a sufficiently long password');
    const now = Date.UTC(2026, 7, 20, 12);
    const token = createLocalAccessSessionToken(passwordHash, now);

    expect(verifyLocalAccessSessionToken(token, passwordHash, now)).toBe(true);
    expect(verifyLocalAccessSessionToken(`${token}x`, passwordHash, now)).toBe(false);
    expect(verifyLocalAccessSessionToken(token, passwordHash, now + 13 * 60 * 60 * 1000)).toBe(
      false,
    );
  });

  it('rejects malformed configured hashes', () => {
    expect(() =>
      getLocalAccessConfiguration({ VAULTMIND_ACCESS_PASSWORD_HASH: 'plain-text-password' }),
    ).toThrow(/access:hash-password/u);
  });
});
