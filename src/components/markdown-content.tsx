import { Fragment } from 'react';

import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

type MarkdownBlock =
  | {
      depth: number;
      text: string;
      type: 'heading';
    }
  | {
      text: string;
      type: 'paragraph';
    }
  | {
      items: MarkdownListItem[];
      type: 'ordered-list' | 'unordered-list';
    }
  | {
      headers: string[];
      rows: string[][];
      type: 'table';
    }
  | {
      code: string;
      language?: string;
      type: 'code';
    }
  | {
      text: string;
      type: 'quote';
    }
  | {
      type: 'rule';
    };

type InlineToken =
  | {
      type: 'code' | 'delete' | 'emphasis' | 'strong' | 'text';
      value: string;
    }
  | {
      alt: string;
      src: string;
      type: 'image';
    }
  | {
      href: string;
      text: string;
      type: 'link';
    };

type MarkdownListItem = {
  checked?: boolean;
  text: string;
};

type MarkdownContentProps = {
  citationHrefByIndex?: Record<number, string>;
  className?: string;
  content: string;
  imageSrcResolver?: (src: string) => null | string;
  variant?: 'default' | 'document';
};

function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

function isBlockStart(line: string): boolean {
  const trimmedLine = line.trim();

  return (
    /^```/u.test(trimmedLine) ||
    /^#{1,6}\s+/u.test(trimmedLine) ||
    /^(-{3,}|\*{3,}|_{3,})$/u.test(trimmedLine) ||
    /^\s*[-*]\s+/u.test(line) ||
    /^\s*\d+\.\s+/u.test(line) ||
    /^>\s?/u.test(line)
  );
}

function parseTableRow(line: string): string[] | null {
  const trimmedLine = line.trim();

  if (!trimmedLine.includes('|')) {
    return null;
  }

  const cells = trimmedLine
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim());

  return cells.length >= 2 ? cells : null;
}

function isTableSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function parseTable(lines: string[], startIndex: number) {
  const headers = parseTableRow(lines[startIndex] ?? '');
  const separator = parseTableRow(lines[startIndex + 1] ?? '');

  if (
    !headers ||
    !separator ||
    headers.length !== separator.length ||
    !isTableSeparatorRow(separator)
  ) {
    return null;
  }

  const rows: string[][] = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const cells = parseTableRow(lines[index] ?? '');

    if (!cells) {
      break;
    }

    rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ''));
    index += 1;
  }

  return {
    block: {
      headers,
      rows,
      type: 'table',
    } satisfies MarkdownBlock,
    nextIndex: index,
  };
}

function parseList(lines: string[], startIndex: number, ordered: boolean) {
  const items: MarkdownListItem[] = [];
  const pattern = ordered ? /^\s*\d+\.\s+(.+)$/u : /^\s*[-*]\s+(.+)$/u;
  let index = startIndex;

  while (index < lines.length) {
    const match = lines[index]?.match(pattern);

    if (!match?.[1]) {
      break;
    }

    const rawItem = match[1].trim();
    const taskMatch = rawItem.match(/^\[( |x|X)\]\s+(.+)$/u);

    items.push(
      taskMatch?.[2]
        ? {
            checked: taskMatch[1]?.toLowerCase() === 'x',
            text: taskMatch[2].trim(),
          }
        : { text: rawItem },
    );
    index += 1;
  }

  return {
    block: {
      items,
      type: ordered ? 'ordered-list' : 'unordered-list',
    } satisfies MarkdownBlock,
    nextIndex: index,
  };
}

function parseCodeBlock(lines: string[], startIndex: number) {
  const openingLine = lines[startIndex]?.trim() ?? '';
  const language = openingLine.replace(/^```/u, '').trim();
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim().startsWith('```')) {
      index += 1;
      break;
    }

    codeLines.push(line);
    index += 1;
  }

  const block: MarkdownBlock = {
    code: codeLines.join('\n'),
    type: 'code',
  };

  if (language) {
    block.language = language;
  }

  return {
    block,
    nextIndex: index,
  };
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0) {
      index += 1;
      continue;
    }

    if (trimmedLine.startsWith('```')) {
      const parsedCodeBlock = parseCodeBlock(lines, index);
      blocks.push(parsedCodeBlock.block);
      index = parsedCodeBlock.nextIndex;
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/u);

    if (headingMatch?.[1] && headingMatch[2]) {
      blocks.push({
        depth: headingMatch[1].length,
        text: headingMatch[2].trim(),
        type: 'heading',
      });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/u.test(trimmedLine)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/u.test(line)) {
      const parsedList = parseList(lines, index, false);
      blocks.push(parsedList.block);
      index = parsedList.nextIndex;
      continue;
    }

    if (/^\s*\d+\.\s+/u.test(line)) {
      const parsedList = parseList(lines, index, true);
      blocks.push(parsedList.block);
      index = parsedList.nextIndex;
      continue;
    }

    const parsedTable = parseTable(lines, index);

    if (parsedTable) {
      blocks.push(parsedTable.block);
      index = parsedTable.nextIndex;
      continue;
    }

    if (/^>\s?/u.test(trimmedLine)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/u.test(lines[index]?.trim() ?? '')) {
        quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/u, ''));
        index += 1;
      }

      blocks.push({
        text: quoteLines.join(' '),
        type: 'quote',
      });
      continue;
    }

    const paragraphLines = [trimmedLine];
    index += 1;

    while (
      index < lines.length &&
      !isBlankLine(lines[index] ?? '') &&
      !isBlockStart(lines[index] ?? '')
    ) {
      paragraphLines.push((lines[index] ?? '').trim());
      index += 1;
    }

    blocks.push({
      text: paragraphLines.join(' '),
      type: 'paragraph',
    });
  }

  return blocks;
}

function pushTextToken(tokens: InlineToken[], value: string) {
  if (value.length > 0) {
    tokens.push({ type: 'text', value });
  }
}

function parseLinkedInlineToken(
  value: string,
  markerIndex: number,
  type: 'image' | 'link',
): { nextIndex: number; token: InlineToken } | null {
  const textStartIndex = type === 'image' ? markerIndex + 2 : markerIndex + 1;
  const closingBracketIndex = value.indexOf(']', textStartIndex);

  if (closingBracketIndex === -1 || value[closingBracketIndex + 1] !== '(') {
    return null;
  }

  const closingParenthesisIndex = value.indexOf(')', closingBracketIndex + 2);

  if (closingParenthesisIndex === -1) {
    return null;
  }

  const label = value.slice(textStartIndex, closingBracketIndex).trim();
  const target = value.slice(closingBracketIndex + 2, closingParenthesisIndex).trim();

  if (type === 'image') {
    return {
      nextIndex: closingParenthesisIndex + 1,
      token: {
        alt: label,
        src: target,
        type: 'image',
      },
    };
  }

  return {
    nextIndex: closingParenthesisIndex + 1,
    token: {
      href: target,
      text: label,
      type: 'link',
    },
  };
}

function parseInlineTokens(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let index = 0;

  while (index < value.length) {
    const codeIndex = value.indexOf('`', index);
    const deleteIndex = value.indexOf('~~', index);
    const strongIndex = value.indexOf('**', index);
    const emphasisIndex = findSingleAsterisk(value, index);
    const imageIndex = value.indexOf('![', index);
    const linkIndex = value.indexOf('[', index);
    const nextCodeIndex = codeIndex === -1 ? Number.POSITIVE_INFINITY : codeIndex;
    const nextDeleteIndex = deleteIndex === -1 ? Number.POSITIVE_INFINITY : deleteIndex;
    const nextStrongIndex = strongIndex === -1 ? Number.POSITIVE_INFINITY : strongIndex;
    const nextEmphasisIndex = emphasisIndex === -1 ? Number.POSITIVE_INFINITY : emphasisIndex;
    const nextImageIndex = imageIndex === -1 ? Number.POSITIVE_INFINITY : imageIndex;
    const nextLinkIndex =
      linkIndex === -1 || (imageIndex !== -1 && linkIndex === imageIndex + 1)
        ? Number.POSITIVE_INFINITY
        : linkIndex;
    const nextMarkerIndex = Math.min(
      nextCodeIndex,
      nextDeleteIndex,
      nextStrongIndex,
      nextEmphasisIndex,
      nextImageIndex,
      nextLinkIndex,
    );

    if (!Number.isFinite(nextMarkerIndex)) {
      pushTextToken(tokens, value.slice(index));
      break;
    }

    pushTextToken(tokens, value.slice(index, nextMarkerIndex));

    if (nextMarkerIndex === nextCodeIndex) {
      const closingIndex = value.indexOf('`', nextMarkerIndex + 1);

      if (closingIndex === -1) {
        pushTextToken(tokens, value.slice(nextMarkerIndex));
        break;
      }

      tokens.push({
        type: 'code',
        value: value.slice(nextMarkerIndex + 1, closingIndex),
      });
      index = closingIndex + 1;
      continue;
    }

    if (nextMarkerIndex === nextDeleteIndex) {
      const closingIndex = value.indexOf('~~', nextMarkerIndex + 2);

      if (closingIndex === -1) {
        pushTextToken(tokens, value.slice(nextMarkerIndex));
        break;
      }

      tokens.push({
        type: 'delete',
        value: value.slice(nextMarkerIndex + 2, closingIndex),
      });
      index = closingIndex + 2;
      continue;
    }

    if (nextMarkerIndex === nextImageIndex || nextMarkerIndex === nextLinkIndex) {
      const parsedLinkedToken = parseLinkedInlineToken(
        value,
        nextMarkerIndex,
        nextMarkerIndex === nextImageIndex ? 'image' : 'link',
      );

      if (!parsedLinkedToken) {
        if (nextMarkerIndex === nextLinkIndex) {
          const citationMatch = value.slice(nextMarkerIndex).match(/^\[\d+\]/u);

          if (citationMatch?.[0]) {
            pushTextToken(tokens, citationMatch[0]);
            index = nextMarkerIndex + citationMatch[0].length;
            continue;
          }
        }

        pushTextToken(tokens, value.slice(nextMarkerIndex, nextMarkerIndex + 1));
        index = nextMarkerIndex + 1;
        continue;
      }

      tokens.push(parsedLinkedToken.token);
      index = parsedLinkedToken.nextIndex;
      continue;
    }

    if (nextMarkerIndex === nextEmphasisIndex) {
      const closingIndex = findSingleAsterisk(value, nextMarkerIndex + 1);

      if (closingIndex === -1) {
        pushTextToken(tokens, value.slice(nextMarkerIndex));
        break;
      }

      tokens.push({
        type: 'emphasis',
        value: value.slice(nextMarkerIndex + 1, closingIndex),
      });
      index = closingIndex + 1;
      continue;
    }

    const closingIndex = value.indexOf('**', nextMarkerIndex + 2);

    if (closingIndex === -1) {
      pushTextToken(tokens, value.slice(nextMarkerIndex));
      break;
    }

    tokens.push({
      type: 'strong',
      value: value.slice(nextMarkerIndex + 2, closingIndex),
    });
    index = closingIndex + 2;
  }

  return tokens;
}

function findSingleAsterisk(value: string, startIndex: number): number {
  let index = value.indexOf('*', startIndex);

  while (index !== -1) {
    const previousCharacter = value[index - 1];
    const nextCharacter = value[index + 1];

    if (previousCharacter !== '*' && nextCharacter !== '*') {
      return index;
    }

    index = value.indexOf('*', index + 1);
  }

  return -1;
}

function isSafeLinkHref(href: string): boolean {
  try {
    const parsedUrl = new URL(href);

    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
  } catch {
    return href.startsWith('#');
  }
}

function isSafeImageSrc(src: string): boolean {
  try {
    return new URL(src).protocol === 'https:';
  } catch {
    return false;
  }
}

function renderText(
  value: string,
  keyPrefix: string,
  citationHrefByIndex?: Record<number, string>,
): ReactNode {
  if (!citationHrefByIndex) {
    return value;
  }

  const segments: ReactNode[] = [];
  const citationPattern = /\[(\d+)\]/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(value)) !== null) {
    const citationText = match[0];
    const citationIndex = Number(match[1]);
    const citationHref = citationHrefByIndex[citationIndex];

    if (match.index > lastIndex) {
      segments.push(value.slice(lastIndex, match.index));
    }

    segments.push(
      citationHref ? (
        <a
          className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
          href={citationHref}
          key={`${keyPrefix}-citation-${citationIndex}-${match.index}`}
        >
          {citationText}
        </a>
      ) : (
        citationText
      ),
    );

    lastIndex = match.index + citationText.length;
  }

  if (lastIndex < value.length) {
    segments.push(value.slice(lastIndex));
  }

  return segments.length > 0 ? segments : value;
}

function renderInline(
  value: string,
  keyPrefix: string,
  citationHrefByIndex?: Record<number, string>,
  imageSrcResolver?: MarkdownContentProps['imageSrcResolver'],
): ReactNode {
  return parseInlineTokens(value).map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.type === 'code') {
      return (
        <code
          className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 font-mono text-[0.85em]"
          key={key}
        >
          {token.value}
        </code>
      );
    }

    if (token.type === 'strong') {
      return (
        <strong key={key}>
          {renderInline(token.value, key, citationHrefByIndex, imageSrcResolver)}
        </strong>
      );
    }

    if (token.type === 'delete') {
      return (
        <del key={key}>{renderInline(token.value, key, citationHrefByIndex, imageSrcResolver)}</del>
      );
    }

    if (token.type === 'emphasis') {
      return (
        <em key={key}>{renderInline(token.value, key, citationHrefByIndex, imageSrcResolver)}</em>
      );
    }

    if (token.type === 'link') {
      if (!isSafeLinkHref(token.href)) {
        return <Fragment key={key}>{token.text}</Fragment>;
      }

      return (
        <a
          className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
          href={token.href}
          key={key}
          rel="noreferrer noopener"
          target={token.href.startsWith('#') ? undefined : '_blank'}
        >
          {renderInline(token.text, key, undefined, imageSrcResolver)}
        </a>
      );
    }

    if (token.type === 'image') {
      const imageSrc = isSafeImageSrc(token.src) ? token.src : imageSrcResolver?.(token.src);

      if (!imageSrc || !isSafeImageSrc(imageSrc)) {
        return <Fragment key={key}>[image: {token.alt || 'blocked'}]</Fragment>;
      }

      return (
        <span
          className="my-4 block overflow-hidden rounded-md border border-[var(--border)]"
          key={key}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Source Markdown can reference arbitrary safe HTTPS images. */}
          <img
            alt={token.alt}
            className="max-h-[32rem] w-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={imageSrc}
          />
        </span>
      );
    }

    return <Fragment key={key}>{renderText(token.value, key, citationHrefByIndex)}</Fragment>;
  });
}

function getHeadingClassName(depth: number, variant: MarkdownContentProps['variant']): string {
  if (variant === 'document') {
    if (depth === 1) {
      return 'mt-0 mb-4 text-2xl font-semibold leading-tight first:mt-0';
    }

    if (depth === 2) {
      return 'mt-8 mb-3 text-xl font-semibold leading-snug first:mt-0';
    }

    return 'mt-6 mb-2 text-base font-semibold first:mt-0';
  }

  if (depth === 1) {
    return 'mt-0 mb-3 text-lg font-semibold first:mt-0';
  }

  if (depth === 2) {
    return 'mt-5 mb-2 text-base font-semibold first:mt-0';
  }

  return 'mt-4 mb-2 text-sm font-semibold first:mt-0';
}

function renderBlock(
  block: MarkdownBlock,
  citationHrefByIndex: MarkdownContentProps['citationHrefByIndex'],
  imageSrcResolver: MarkdownContentProps['imageSrcResolver'],
  index: number,
  variant: MarkdownContentProps['variant'],
): ReactNode {
  const key = `markdown-block-${index}`;
  const isDocument = variant === 'document';

  if (block.type === 'heading') {
    const className = getHeadingClassName(block.depth, variant);

    if (block.depth === 1) {
      return (
        <h2 className={className} key={key}>
          {renderInline(block.text, key, citationHrefByIndex, imageSrcResolver)}
        </h2>
      );
    }

    if (block.depth === 2) {
      return (
        <h3 className={className} key={key}>
          {renderInline(block.text, key, citationHrefByIndex, imageSrcResolver)}
        </h3>
      );
    }

    return (
      <h4 className={className} key={key}>
        {renderInline(block.text, key, citationHrefByIndex, imageSrcResolver)}
      </h4>
    );
  }

  if (block.type === 'paragraph') {
    return (
      <p
        className={cn(
          'break-words text-[var(--foreground)] first:mt-0 last:mb-0',
          isDocument ? 'my-4 text-base leading-7' : 'my-3',
        )}
        key={key}
      >
        {renderInline(block.text, key, citationHrefByIndex, imageSrcResolver)}
      </p>
    );
  }

  if (block.type === 'unordered-list') {
    const hasTaskItems = block.items.some((item) => item.checked !== undefined);

    return (
      <ul
        className={cn(
          'first:mt-0 last:mb-0',
          hasTaskItems ? 'list-none' : 'list-disc',
          isDocument
            ? cn('my-4 space-y-2 text-base leading-7', hasTaskItems ? 'pl-0' : 'pl-6')
            : cn('my-3 space-y-1', hasTaskItems ? 'pl-0' : 'pl-5'),
        )}
        key={key}
      >
        {block.items.map((item, itemIndex) => (
          <li
            className={cn(
              'break-words',
              item.checked !== undefined ? 'flex items-start gap-2' : null,
            )}
            key={`${key}-${itemIndex}`}
          >
            {item.checked !== undefined ? (
              <input
                checked={item.checked}
                className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                disabled
                readOnly
                type="checkbox"
              />
            ) : null}
            <span>
              {renderInline(
                item.text,
                `${key}-${itemIndex}`,
                citationHrefByIndex,
                imageSrcResolver,
              )}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === 'ordered-list') {
    return (
      <ol
        className={cn(
          'list-decimal first:mt-0 last:mb-0',
          isDocument ? 'my-4 space-y-2 pl-6 text-base leading-7' : 'my-3 space-y-1 pl-5',
        )}
        key={key}
      >
        {block.items.map((item, itemIndex) => (
          <li className="break-words" key={`${key}-${itemIndex}`}>
            {renderInline(item.text, `${key}-${itemIndex}`, citationHrefByIndex, imageSrcResolver)}
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === 'table') {
    return (
      <div
        className={cn(
          'overflow-x-auto rounded-md border border-[var(--border)] first:mt-0 last:mb-0',
          isDocument ? 'my-6' : 'my-4',
        )}
        key={key}
      >
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--muted)]">
            <tr>
              {block.headers.map((header, headerIndex) => (
                <th
                  className="border-b border-[var(--border)] px-3 py-2 font-semibold"
                  key={`${key}-header-${headerIndex}`}
                  scope="col"
                >
                  {renderInline(
                    header,
                    `${key}-header-${headerIndex}`,
                    citationHrefByIndex,
                    imageSrcResolver,
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr className="border-t border-[var(--border)]" key={`${key}-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td className="px-3 py-2 align-top" key={`${key}-cell-${rowIndex}-${cellIndex}`}>
                    {renderInline(
                      cell,
                      `${key}-cell-${rowIndex}-${cellIndex}`,
                      citationHrefByIndex,
                      imageSrcResolver,
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === 'code') {
    const pre = (
      <pre
        className={cn(
          'overflow-x-auto bg-[var(--background)] p-3 text-xs leading-6 first:mt-0 last:mb-0',
          block.language
            ? 'rounded-b-md border-x border-b border-[var(--border)]'
            : 'rounded-md border border-[var(--border)]',
        )}
      >
        <code className="font-mono">{block.code}</code>
      </pre>
    );

    if (block.language) {
      return (
        <div className={cn('first:mt-0 last:mb-0', isDocument ? 'my-5' : 'my-3')} key={key}>
          <div className="rounded-t-md border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 font-mono text-[0.7rem] uppercase text-[var(--muted-foreground)]">
            {block.language}
          </div>
          {pre}
        </div>
      );
    }

    return (
      <div className={cn('first:mt-0 last:mb-0', isDocument ? 'my-5' : 'my-3')} key={key}>
        {pre}
      </div>
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote
        className={cn(
          'border-l-2 border-[var(--border)] text-[var(--muted-foreground)] first:mt-0 last:mb-0',
          isDocument ? 'my-5 pl-4 text-base leading-7' : 'my-3 pl-3',
        )}
        key={key}
      >
        {renderInline(block.text, key, citationHrefByIndex, imageSrcResolver)}
      </blockquote>
    );
  }

  return <hr className={cn('border-[var(--border)]', isDocument ? 'my-8' : 'my-4')} key={key} />;
}

export function MarkdownContent({
  citationHrefByIndex,
  className,
  content,
  imageSrcResolver,
  variant = 'default',
}: MarkdownContentProps) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div
      className={cn(
        variant === 'document'
          ? 'overflow-visible bg-transparent text-base leading-7'
          : 'overflow-auto rounded-md border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-sm leading-6',
        className,
      )}
    >
      {blocks.length > 0
        ? blocks.map((block, index) =>
            renderBlock(block, citationHrefByIndex, imageSrcResolver, index, variant),
          )
        : null}
    </div>
  );
}
