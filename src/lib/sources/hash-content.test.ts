import { describe, expect, it } from 'vitest';

import { hashContent } from '@/lib/sources/hash-content';

describe('hashContent', () => {
  it('returns a stable SHA-256 hash for UTF-8 content', () => {
    expect(hashContent('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});
