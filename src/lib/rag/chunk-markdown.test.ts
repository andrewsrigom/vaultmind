import { describe, expect, it } from 'vitest';

import { chunkMarkdown } from '@/lib/rag/chunk-markdown';

describe('chunkMarkdown', () => {
  it('keeps tiny documents as one readable chunk', () => {
    const content = '# Tiny\n\nShort note.';
    const chunks = chunkMarkdown(content, {
      maxChunkChars: 120,
      minChunkChars: 100,
      overlapChars: 20,
    });
    const [chunk] = chunks;

    expect(chunks).toHaveLength(1);
    expect(chunk).toMatchObject({
      chunkIndex: 0,
      content,
      metadata: {
        headings: ['Tiny'],
        title: 'Tiny',
      },
      tokenEstimate: Math.ceil(content.length / 4),
    });
  });

  it('prefers heading-aware chunks', () => {
    const content = `# Main

Intro paragraph with enough text to keep this section useful for retrieval.

## Part A

This section explains the adapter boundary and normalized source documents.

## Part B

This section explains manual sync and safe local storage.`;
    const chunks = chunkMarkdown(content, {
      maxChunkChars: 130,
      minChunkChars: 50,
      overlapChars: 20,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.content.includes('## Part A'))).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('## Part B'))).toBe(true);
    expect(chunks.every((chunk) => chunk.content.length >= 50 || content.length < 50)).toBe(true);
  });

  it('adds overlap when splitting long sections', () => {
    const repeatedText = Array.from({ length: 90 }, (_, index) => `word${index}`).join(' ');
    const chunks = chunkMarkdown(`# Long\n\n${repeatedText}`, {
      maxChunkChars: 160,
      minChunkChars: 40,
      overlapChars: 35,
    });
    const firstChunk = chunks[0];
    const secondChunk = chunks[1];

    expect(chunks.length).toBeGreaterThan(1);
    expect(firstChunk).toBeDefined();
    expect(secondChunk).toBeDefined();

    if (!firstChunk || !secondChunk) {
      throw new Error('Expected at least two chunks.');
    }

    const sharedSuffix = firstChunk.content.slice(-24).trim();

    expect(secondChunk.content).toContain(sharedSuffix);
  });

  it('includes document-level metadata on chunks', () => {
    const chunks = chunkMarkdown(
      `---
tags: [rag, markdown]
---
# VaultMind

This note links to [[Source Adapter]] and explains chunk metadata.`,
      {
        maxChunkChars: 120,
        minChunkChars: 40,
        overlapChars: 20,
      },
    );
    const [chunk] = chunks;

    expect(chunk?.metadata).toEqual({
      headings: ['VaultMind'],
      tags: ['rag', 'markdown'],
      title: 'VaultMind',
      wikiLinks: ['Source Adapter'],
    });
  });
});
