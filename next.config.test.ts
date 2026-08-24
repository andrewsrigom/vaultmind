import { describe, expect, it } from 'vitest';

import { getVaultMindSecurityHeaders } from './next.config';

describe('getVaultMindSecurityHeaders', () => {
  it('enables HSTS only in production', () => {
    expect(getVaultMindSecurityHeaders('production')).toContainEqual({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });

    expect(getVaultMindSecurityHeaders('development')).not.toContainEqual(
      expect.objectContaining({
        key: 'Strict-Transport-Security',
      }),
    );
    expect(getVaultMindSecurityHeaders('test')).not.toContainEqual(
      expect.objectContaining({
        key: 'Strict-Transport-Security',
      }),
    );
  });
});
