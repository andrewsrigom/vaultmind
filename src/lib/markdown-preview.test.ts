import { describe, expect, it } from 'vitest';

import { createMarkdownPreview } from '@/lib/markdown-preview';

describe('createMarkdownPreview', () => {
  it('returns readable plain text from common Markdown syntax', () => {
    const preview = createMarkdownPreview(
      [
        '# Release readiness',
        '',
        '- Review **source freshness** before [handoff](https://example.com).',
        '- Include ![Architecture diagram](https://example.com/diagram.png).',
        '',
        '| Area | Owner |',
        '| --- | --- |',
        '| Search | Engineering |',
      ].join('\n'),
      { maxLength: 220 },
    );

    expect(preview).toBe(
      'Release readiness Review source freshness before handoff. Include Architecture diagram. Area Owner Search Engineering',
    );
  });

  it('truncates at a word boundary when possible', () => {
    const preview = createMarkdownPreview('One two three four five six seven', { maxLength: 18 });

    expect(preview).toBe('One two three...');
  });
});
