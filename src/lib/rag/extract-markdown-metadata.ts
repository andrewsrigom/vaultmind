import type { MarkdownHeading, MarkdownMetadata } from '@/lib/rag/types';

const fencedCodeBlockPattern = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;

function cleanFrontmatterValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function getUniqueValues(values: string[]): string[] {
  const seenValues = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0 || seenValues.has(normalizedValue)) {
      continue;
    }

    seenValues.add(normalizedValue);
    uniqueValues.push(normalizedValue);
  }

  return uniqueValues;
}

function parseInlineList(value: string): string[] {
  const trimmedValue = value.trim();
  const listValue =
    trimmedValue.startsWith('[') && trimmedValue.endsWith(']')
      ? trimmedValue.slice(1, -1)
      : trimmedValue;

  return getUniqueValues(listValue.split(',').map(cleanFrontmatterValue));
}

function parseFrontmatterValue(value: string): string | string[] {
  if (value.includes(',') || (value.startsWith('[') && value.endsWith(']'))) {
    return parseInlineList(value);
  }

  return cleanFrontmatterValue(value);
}

function parseFrontmatter(content: string): {
  body: string;
  frontmatter?: Record<string, string | string[]>;
} {
  const match = frontmatterPattern.exec(content);

  if (!match?.[1]) {
    return {
      body: content,
    };
  }

  const frontmatter: Record<string, string | string[]> = {};
  const lines = match[1].split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const keyValueMatch = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);

    if (!keyValueMatch?.[1]) {
      continue;
    }

    const key = keyValueMatch[1];
    const rawValue = keyValueMatch[2] ?? '';

    if (rawValue.length > 0) {
      frontmatter[key] = parseFrontmatterValue(rawValue);
      continue;
    }

    const listValues: string[] = [];

    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1];
      const listItemMatch = /^\s*-\s+(.+)$/.exec(nextLine ?? '');

      if (!listItemMatch?.[1]) {
        break;
      }

      listValues.push(cleanFrontmatterValue(listItemMatch[1]));
      index += 1;
    }

    if (listValues.length > 0) {
      frontmatter[key] = getUniqueValues(listValues);
    }
  }

  return {
    body: content.slice(match[0].length),
    ...(Object.keys(frontmatter).length > 0 ? { frontmatter } : {}),
  };
}

function stripFencedCodeBlocks(content: string): string {
  return content.replace(fencedCodeBlockPattern, '');
}

function extractHeadings(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];

  for (const match of content.matchAll(headingPattern)) {
    const marker = match[1];
    const rawText = match[2];

    if (!marker || !rawText) {
      continue;
    }

    headings.push({
      level: marker.length,
      text: rawText.trim(),
    });
  }

  return headings;
}

function extractTags(frontmatter?: Record<string, string | string[]>): string[] {
  const tags = frontmatter?.tags;

  if (!tags) {
    return [];
  }

  return Array.isArray(tags) ? getUniqueValues(tags) : getUniqueValues([tags]);
}

function extractWikiLinks(content: string): string[] {
  const wikiLinks: string[] = [];

  for (const match of content.matchAll(wikiLinkPattern)) {
    const rawTarget = match[1]?.split('|')[0]?.trim();

    if (rawTarget) {
      wikiLinks.push(rawTarget);
    }
  }

  return getUniqueValues(wikiLinks);
}

export function extractMarkdownMetadata(content: string): MarkdownMetadata {
  const { body, frontmatter } = parseFrontmatter(content);
  const searchableContent = stripFencedCodeBlocks(body);
  const headings = extractHeadings(searchableContent);
  const title = headings.find((heading) => heading.level === 1)?.text ?? null;
  const tags = extractTags(frontmatter);
  const wikiLinks = extractWikiLinks(searchableContent);

  return {
    ...(frontmatter ? { frontmatter } : {}),
    headings,
    tags,
    title,
    wikiLinks,
  };
}
