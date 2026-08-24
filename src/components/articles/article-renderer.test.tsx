import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ArticleDocumentLayout,
  createKnowledgeArtifactCitationHrefByIndex,
  createKnowledgeArtifactImageSrcResolver,
} from '@/components/articles/article-renderer';
import { MarkdownContent } from '@/components/markdown-content';

describe('ArticleDocumentLayout', () => {
  it('shows consulted source count in the document header', () => {
    const markup = renderToStaticMarkup(
      <ArticleDocumentLayout
        locale="en"
        noSourcesLabel="No consulted documents."
        sourceReferences={[
          {
            chunkId: 'chunk-1',
            citationIndex: 1,
            documentId: 'document-1',
            path: 'docs/readiness.md',
            sourceName: 'Engineering docs',
            sourceType: 'github',
            title: 'Readiness docs',
          },
        ]}
        sourcesTitle="Consulted documents"
        status="approved"
        statusNode={<span>Verified</span>}
        title={<h1>Readiness guide</h1>}
        updatedAt={new Date('2026-06-26T12:00:00.000Z')}
      >
        <p>Body</p>
      </ArticleDocumentLayout>,
    );

    expect(markup).toContain('Consulted documents: 1');
    expect(markup).toContain('Readiness guide');
    expect(markup).toContain('Readiness docs');
  });

  it('links citation markers directly to resolved source documents', () => {
    const sourceReferences = [
      {
        chunkId: 'chunk-1',
        citationIndex: 1,
        documentId: 'document-1',
        path: 'docs/readiness.md',
        sourceName: 'Engineering docs',
        sourceType: 'github' as const,
        title: 'Readiness docs',
      },
    ];
    const markup = renderToStaticMarkup(
      <ArticleDocumentLayout
        areaId="area-1"
        articleId="article-1"
        locale="en"
        noSourcesLabel="No consulted documents."
        vaultId="vault-1"
        sourceReferences={sourceReferences}
        sourcesTitle="Consulted documents"
        status="approved"
        title={<h1>Readiness guide</h1>}
        updatedAt={new Date('2026-06-26T12:00:00.000Z')}
      >
        <MarkdownContent
          citationHrefByIndex={createKnowledgeArtifactCitationHrefByIndex(sourceReferences, {
            areaId: 'area-1',
            articleId: 'article-1',
            vaultId: 'vault-1',
          })}
          content="The release steps are source-backed [1]."
          variant="document"
        />
      </ArticleDocumentLayout>,
    );

    expect(markup).toContain(
      'href="/vault/vault-1/documents/document-1?areaId=area-1&amp;articleId=article-1"',
    );
    expect(markup).toContain('The release steps are source-backed');
    expect(markup).toContain('[1]');
  });

  it('resolves GitHub-relative images from source metadata', () => {
    const sourceReferences = [
      {
        chunkId: 'chunk-1',
        citationIndex: 1,
        documentId: 'document-1',
        path: 'docs/release/readiness.md',
        sourceMetadata: {
          branch: 'main',
          owner: 'acme',
          repo: 'handbook',
          sourceType: 'github',
        },
        sourceName: 'Engineering docs',
        sourceType: 'github' as const,
        title: 'Readiness docs',
      },
    ];
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content="![Release flow](../assets/release flow.png)"
        imageSrcResolver={createKnowledgeArtifactImageSrcResolver(sourceReferences)}
        variant="document"
      />,
    );

    expect(markup).toContain(
      'src="https://raw.githubusercontent.com/acme/handbook/main/docs/assets/release%20flow.png"',
    );
    expect(markup).toContain('alt="Release flow"');
  });
});
