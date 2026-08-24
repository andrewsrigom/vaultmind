import { describe, expect, it } from 'vitest';

import { createVaultAskHref, createVaultSettingsHref, isSettingsPath } from '@/lib/routes';

describe('ask routes', () => {
  it('preserves session and prompt params', () => {
    expect(
      createVaultAskHref({
        chatSessionId: 'session-1',
        prompt: 'What changed?',
        vaultId: 'org-1',
        vaultSlug: 'acme',
      }),
    ).toBe('/vault/acme/ask?chatSessionId=session-1&prompt=What+changed%3F');
  });
});

describe('settings routes', () => {
  it('builds vault-scoped and root settings hrefs', () => {
    expect(
      createVaultSettingsHref({
        vaultId: 'org-1',
        vaultSlug: 'acme',
      }),
    ).toBe('/vault/acme/settings');
    expect(
      createVaultSettingsHref({
        vaultId: 'org-1',
      }),
    ).toBe('/vault/org-1/settings');
    expect(createVaultSettingsHref({})).toBe('/settings');
  });

  it('matches only settings paths', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/vault/acme/settings')).toBe(true);
    expect(isSettingsPath('/vault/acme/settings/members')).toBe(false);
    expect(isSettingsPath('/vault/acme/integrations')).toBe(false);
  });
});
