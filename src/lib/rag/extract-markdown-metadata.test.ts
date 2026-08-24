import { describe, expect, it } from 'vitest';

import { extractMarkdownMetadata } from '@/lib/rag/extract-markdown-metadata';

describe('extractMarkdownMetadata', () => {
  it('extracts frontmatter, tags, title, headings, and wiki links', () => {
    const metadata = extractMarkdownMetadata(`---
aliases: [vault, brain]
owner: "Andrew"
tags:
  - rag
  - notes
---
# VaultMind

Intro with [[RAG]] and [[Source Adapter|source label]].

## Architecture

\`\`\`
# Not a heading
[[Ignored]]
\`\`\`

### Pipeline
`);

    expect(metadata).toEqual({
      frontmatter: {
        aliases: ['vault', 'brain'],
        owner: 'Andrew',
        tags: ['rag', 'notes'],
      },
      headings: [
        {
          level: 1,
          text: 'VaultMind',
        },
        {
          level: 2,
          text: 'Architecture',
        },
        {
          level: 3,
          text: 'Pipeline',
        },
      ],
      tags: ['rag', 'notes'],
      title: 'VaultMind',
      wikiLinks: ['RAG', 'Source Adapter'],
    });
  });

  it('returns null title and empty metadata for plain text', () => {
    expect(extractMarkdownMetadata('Just a note without Markdown metadata.')).toEqual({
      headings: [],
      tags: [],
      title: null,
      wikiLinks: [],
    });
  });
});
