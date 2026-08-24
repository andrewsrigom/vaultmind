import { describe, expect, it } from 'vitest';

import { getOAuthAccessDeniedStatus } from '@/lib/access/api-access';

describe('connector OAuth access helpers', () => {
  it('maps API access failures to OAuth redirect statuses', () => {
    expect(getOAuthAccessDeniedStatus(401)).toBe('auth-required');
    expect(getOAuthAccessDeniedStatus(403)).toBe('forbidden');
    expect(getOAuthAccessDeniedStatus(500)).toBe('forbidden');
  });
});
