import { extractMarkdownMetadata } from '@/lib/rag/extract-markdown-metadata';

import type { DocumentChunkInput } from '@/lib/rag/types';
import type { MarkdownMetadata } from '@/lib/rag/types';

export type ChunkMarkdownOptions = {
  maxChunkChars?: number;
  minChunkChars?: number;
  overlapChars?: number;
};

type MarkdownSection = {
  content: string;
};

const defaultChunkOptions = {
  maxChunkChars: 1400,
  minChunkChars: 100,
  overlapChars: 200,
} as const;

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function getHeadingText(line: string): string | null {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

  return match?.[2]?.trim() ?? null;
}

function splitIntoHeadingSections(content: string): MarkdownSection[] {
  const lines = content.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingText = getHeadingText(line);

    if (headingText && currentLines.some((currentLine) => currentLine.trim().length > 0)) {
      sections.push({
        content: currentLines.join('\n').trim(),
      });
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.some((line) => line.trim().length > 0)) {
    sections.push({
      content: currentLines.join('\n').trim(),
    });
  }

  return sections.length > 0
    ? sections
    : [
        {
          content: content.trim(),
        },
      ];
}

function findReadableEnd(content: string, start: number, maxEnd: number): number {
  if (maxEnd >= content.length) {
    return content.length;
  }

  const minimumEnd = Math.min(content.length, start + Math.floor((maxEnd - start) * 0.7));
  const window = content.slice(minimumEnd, maxEnd);
  const lastParagraphBreak = window.lastIndexOf('\n\n');

  if (lastParagraphBreak >= 0) {
    return minimumEnd + lastParagraphBreak;
  }

  const lastSentenceBreak = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('? '),
    window.lastIndexOf('! '),
  );

  if (lastSentenceBreak >= 0) {
    return minimumEnd + lastSentenceBreak + 1;
  }

  const lastSpace = window.lastIndexOf(' ');

  if (lastSpace >= 0) {
    return minimumEnd + lastSpace;
  }

  return maxEnd;
}

function splitLongText(content: string, maxChunkChars: number, overlapChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const maxEnd = Math.min(content.length, start + maxChunkChars);
    const end = findReadableEnd(content, start, maxEnd);
    const chunk = content.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end >= content.length) {
      break;
    }

    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}

function combineSections(sections: MarkdownSection[], maxChunkChars: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  for (const section of sections) {
    if (section.content.length > maxChunkChars) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      chunks.push(section.content);
      continue;
    }

    const nextChunk = currentChunk
      ? `${currentChunk.trim()}\n\n${section.content}`
      : section.content;

    if (currentChunk && nextChunk.length > maxChunkChars) {
      chunks.push(currentChunk.trim());
      currentChunk = section.content;
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function mergeTinyFinalChunk(chunks: string[], minChunkChars: number): string[] {
  if (chunks.length < 2) {
    return chunks;
  }

  const lastChunk = chunks.at(-1);
  const previousChunk = chunks.at(-2);

  if (!lastChunk || !previousChunk || lastChunk.length >= minChunkChars) {
    return chunks;
  }

  return [...chunks.slice(0, -2), `${previousChunk}\n\n${lastChunk}`.trim()];
}

function buildChunkMetadata(
  content: string,
  documentMetadata: MarkdownMetadata,
): Record<string, unknown> | undefined {
  const metadata = extractMarkdownMetadata(content);
  const chunkMetadata: Record<string, unknown> = {};

  if (metadata.headings.length > 0) {
    chunkMetadata.headings = metadata.headings.map((heading) => heading.text);
  }

  if (documentMetadata.tags.length > 0) {
    chunkMetadata.tags = documentMetadata.tags;
  }

  if (documentMetadata.title) {
    chunkMetadata.title = documentMetadata.title;
  }

  if (metadata.wikiLinks.length > 0) {
    chunkMetadata.wikiLinks = metadata.wikiLinks;
  }

  return Object.keys(chunkMetadata).length > 0 ? chunkMetadata : undefined;
}

export function chunkMarkdown(
  content: string,
  options: ChunkMarkdownOptions = {},
): DocumentChunkInput[] {
  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    return [];
  }

  const maxChunkChars = options.maxChunkChars ?? defaultChunkOptions.maxChunkChars;
  const minChunkChars = options.minChunkChars ?? defaultChunkOptions.minChunkChars;
  const overlapChars = Math.min(
    options.overlapChars ?? defaultChunkOptions.overlapChars,
    Math.floor(maxChunkChars / 2),
  );
  const sections = splitIntoHeadingSections(trimmedContent);
  const documentMetadata = extractMarkdownMetadata(trimmedContent);
  const combinedChunks = combineSections(sections, maxChunkChars);
  const splitChunks = combinedChunks.flatMap((chunk) =>
    chunk.length > maxChunkChars ? splitLongText(chunk, maxChunkChars, overlapChars) : [chunk],
  );
  const chunks = mergeTinyFinalChunk(splitChunks, minChunkChars);

  return chunks.map((chunk, chunkIndex) => {
    const metadata = buildChunkMetadata(chunk, documentMetadata);

    return {
      chunkIndex,
      content: chunk,
      ...(metadata ? { metadata } : {}),
      tokenEstimate: estimateTokens(chunk),
    };
  });
}
