import { describe, expect, it } from 'vitest';

import { classifyRetrievalQuery, rankRelevantChunksForQuery } from '@/lib/rag/retrieval-ranking';

import type { RelevantChunk } from '@/lib/rag/search-relevant-chunks';

function createChunk(
  input: {
    content?: string;
    documentId?: string;
    path: string;
    similarity: number;
    title?: string;
  },
  index: number,
): RelevantChunk {
  return {
    chunkId: `${input.documentId ?? input.path}-${index}`,
    chunkIndex: index,
    chunkMetadata: null,
    content: input.content ?? input.title ?? input.path,
    documentId: input.documentId ?? input.path,
    documentMetadata: null,
    path: input.path,
    similarity: input.similarity,
    sourceId: 'source-id',
    sourceName: 'GitHub Docs',
    sourceType: 'github',
    title: input.title ?? input.path,
  };
}

describe('retrieval ranking', () => {
  it('classifies common query intents', () => {
    expect(classifyRetrievalQuery('What is this project about?')).toBe('overview');
    expect(classifyRetrievalQuery('How should I run this locally?')).toBe('how-to');
    expect(classifyRetrievalQuery('What is the OFAC policy?')).toBe('policy');
    expect(classifyRetrievalQuery('Create a support FAQ')).toBe('support');
    expect(classifyRetrievalQuery('Which documentation gaps exist?')).toBe('gap');
    expect(classifyRetrievalQuery('How does the mock API implementation work?')).toBe(
      'implementation',
    );
  });

  it('ranks root README above a more vector-similar initiative for overview questions', () => {
    const results = rankRelevantChunksForQuery(
      [
        createChunk(
          {
            path: 'docs/development/itdev-793-mr-orchestration.md',
            similarity: 0.95,
            title: 'ITDEV-793 MR Orchestration',
          },
          0,
        ),
        createChunk(
          {
            path: 'README.md',
            similarity: 0.2,
            title: 'robs-web',
          },
          1,
        ),
      ],
      'What is this project about?',
      2,
    );

    expect(results[0]?.path).toBe('README.md');
  });

  it('does not let local note README files dominate repository overview questions', () => {
    const results = rankRelevantChunksForQuery(
      [
        createChunk(
          {
            path: 'local-files/overdraft-program-flow-gallery/README.md',
            similarity: 0.98,
            title: 'Overdraft Program Flow Gallery',
          },
          0,
        ),
        createChunk(
          {
            path: 'README.md',
            similarity: 0.2,
            title: 'robs-web',
          },
          1,
        ),
      ],
      'What is this project about?',
      2,
    );

    expect(results[0]?.path).toBe('README.md');
  });

  it('ranks technical solution docs first for implementation questions', () => {
    const results = rankRelevantChunksForQuery(
      [
        createChunk(
          {
            path: 'README.md',
            similarity: 0.92,
            title: 'robs-web',
          },
          0,
        ),
        createChunk(
          {
            path: 'docs/technical-solutions/storybook-to-figma.md',
            similarity: 0.7,
            title: 'Storybook to Figma technical solution',
          },
          1,
        ),
      ],
      'How does the technical implementation work?',
      2,
    );

    expect(results[0]?.path).toBe('docs/technical-solutions/storybook-to-figma.md');
  });

  it('limits repeated chunks from one document before filling from another document', () => {
    const results = rankRelevantChunksForQuery(
      [
        createChunk({ documentId: 'alpha', path: 'docs/alpha.md', similarity: 0.99 }, 0),
        createChunk({ documentId: 'alpha', path: 'docs/alpha.md', similarity: 0.98 }, 1),
        createChunk({ documentId: 'alpha', path: 'docs/alpha.md', similarity: 0.97 }, 2),
        createChunk({ documentId: 'beta', path: 'docs/beta.md', similarity: 0.5 }, 3),
      ],
      'alpha',
      3,
    );

    expect(results.map((result) => result.chunkId)).toEqual(['alpha-0', 'alpha-1', 'beta-3']);
  });
});
