const defaultPreviewLength = 180;

function stripMarkdownSyntax(content: string): string {
  return content
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/^>\s?/gmu, '')
    .replace(/^\s*[-*]\s+/gmu, '')
    .replace(/^\s*\d+\.\s+/gmu, '')
    .replace(/^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/gmu, ' ')
    .replace(/\|/gu, ' ')
    .replace(/[*_`~]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function createMarkdownPreview(
  content: string,
  { maxLength = defaultPreviewLength }: { maxLength?: number } = {},
): string {
  const normalized = stripMarkdownSyntax(content);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const slice = normalized.slice(0, maxLength).trimEnd();
  const lastSpaceIndex = slice.lastIndexOf(' ');
  const minimumWordBoundaryLength = Math.floor(maxLength * 0.65);
  const trimmedSlice =
    lastSpaceIndex > minimumWordBoundaryLength ? slice.slice(0, lastSpaceIndex) : slice;

  return `${trimmedSlice.trimEnd()}...`;
}
