import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MarkdownContent } from '@/components/markdown-content';

describe('MarkdownContent', () => {
  it('keeps the default renderer chrome by default', () => {
    const markup = renderToStaticMarkup(<MarkdownContent content="Default paragraph." />);

    expect(markup).toContain('rounded-md');
    expect(markup).toContain('bg-[var(--muted)]');
    expect(markup).toContain('text-sm');
    expect(markup).toContain('Default paragraph.');
  });

  it('renders the document variant without default chrome', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={['# Document title', '', 'Body copy.'].join('\n')}
        variant="document"
      />,
    );

    expect(markup).toContain('overflow-visible');
    expect(markup).toContain('bg-transparent');
    expect(markup).toContain('text-2xl');
    expect(markup).not.toContain('px-4 py-3 text-sm leading-6');
    expect(markup).toContain('Document title');
    expect(markup).toContain('Body copy.');
  });

  it('renders simple Markdown tables', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={[
          '| Step | Owner |',
          '| --- | --- |',
          '| Access request | IT |',
          '| Approval | Manager |',
        ].join('\n')}
      />,
    );

    expect(markup).toContain('<table');
    expect(markup).toContain('<th');
    expect(markup).toContain('Access request');
    expect(markup).toContain('Manager');
  });

  it('renders fenced code block language labels', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent content={['```ts', 'const ready = true;', '```'].join('\n')} />,
    );

    expect(markup).toContain('>ts</div>');
    expect(markup).toContain('const ready = true;');
    expect(markup).toContain('rounded-t-md');
  });

  it('renders task list checkboxes', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={[
          '- [x] Confirm source sync',
          '- [ ] Review cited answer',
          '- Keep regular bullets readable',
        ].join('\n')}
      />,
    );

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('checked=""');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Confirm source sync');
    expect(markup).toContain('Review cited answer');
    expect(markup).toContain('Keep regular bullets readable');
  });

  it('renders inline emphasis without breaking strong text', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent content="Use *draft* wording and **source-backed** claims." />,
    );

    expect(markup).toContain('<em>draft</em>');
    expect(markup).toContain('<strong>source-backed</strong>');
  });

  it('renders deleted text for outdated Markdown notes', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent content="Keep current guidance and ~~remove stale guidance~~." />,
    );

    expect(markup).toContain('<del>remove stale guidance</del>');
  });

  it('renders safe links and https images', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={[
          '[Northstar](https://example.com/docs)',
          '',
          '![Architecture diagram](https://example.com/architecture.png)',
        ].join('\n')}
      />,
    );

    expect(markup).toContain('href="https://example.com/docs"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('src="https://example.com/architecture.png"');
    expect(markup).toContain('alt="Architecture diagram"');
  });

  it('uses an image resolver for approved relative image sources', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content="![Diagram](../assets/flow chart.png)"
        imageSrcResolver={(src) =>
          src === '../assets/flow chart.png'
            ? 'https://raw.githubusercontent.com/acme/docs/main/assets/flow%20chart.png'
            : null
        }
      />,
    );

    expect(markup).toContain(
      'src="https://raw.githubusercontent.com/acme/docs/main/assets/flow%20chart.png"',
    );
    expect(markup).toContain('alt="Diagram"');
  });

  it('links citation markers when citation anchors are provided', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        citationHrefByIndex={{
          1: '#source-1',
        }}
        content="Benefits are documented in the handbook [1] and elsewhere [2]."
      />,
    );

    expect(markup).toContain('href="#source-1"');
    expect(markup).toContain('[1]');
    expect(markup).toContain('elsewhere [2]');
  });

  it('blocks unsafe link and image URLs', () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={['[Unsafe](javascript:alert(1))', '', '![Unsafe image](javascript:alert(1))'].join(
          '\n',
        )}
      />,
    );

    expect(markup).not.toContain('javascript:');
    expect(markup).toContain('Unsafe');
    expect(markup).toContain('[image: Unsafe image]');
  });
});
