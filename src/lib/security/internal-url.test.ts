import { describe, expect, it } from 'vitest';

import {
  buildCanonicalInternalUrl,
  parseCanonicalInternalUrl,
  resolveCanonicalInternalPath,
} from '@/lib/security/internal-url';

const canonicalOrigin = 'https://vaultmind.example';
const backslashRedirect = '/\\evil.example/path';

describe('canonical internal URL helpers', () => {
  it('resolves relative paths against the exact canonical origin', () => {
    expect(resolveCanonicalInternalPath('/settings?tab=sources#plan', canonicalOrigin)).toBe(
      '/settings?tab=sources#plan',
    );
    expect(
      buildCanonicalInternalUrl({
        canonicalOrigin,
        fallbackPath: '/integrations',
        path: '/settings?tab=sources',
      }),
    ).toBe('https://vaultmind.example/settings?tab=sources');
  });

  it('rejects external, protocol-relative, and backslash redirects', () => {
    expect(parseCanonicalInternalUrl('https://evil.example/path', canonicalOrigin)).toBeNull();
    expect(parseCanonicalInternalUrl('//evil.example/path', canonicalOrigin)).toBeNull();
    expect(parseCanonicalInternalUrl(backslashRedirect, canonicalOrigin)).toBeNull();
  });

  it('falls back on the canonical origin when an unsafe path is supplied', () => {
    expect(
      buildCanonicalInternalUrl({
        canonicalOrigin,
        fallbackPath: '/integrations',
        path: backslashRedirect,
      }),
    ).toBe('https://vaultmind.example/integrations');
  });
});
