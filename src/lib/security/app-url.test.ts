import { describe, expect, it } from 'vitest';

import {
  AppBaseUrlConfigurationError,
  canonicalizeHttpOrigin,
  resolveAppBaseUrl,
} from '@/lib/security/app-url';

describe('app URL configuration', () => {
  it('uses localhost during development', () => {
    expect(resolveAppBaseUrl({ NODE_ENV: 'development' })).toBe('http://localhost:3000');
  });

  it('canonicalizes a configured origin', () => {
    expect(canonicalizeHttpOrigin('https://vault.example/')).toBe('https://vault.example');
  });

  it('requires a public HTTPS origin in production', () => {
    expect(() =>
      resolveAppBaseUrl({ NODE_ENV: 'production', VAULTMIND_BASE_URL: 'http://localhost:3000' }),
    ).toThrow(AppBaseUrlConfigurationError);
  });
});
