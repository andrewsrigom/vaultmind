export type DocumentChunkInput = {
  chunkIndex: number;
  content: string;
  metadata?: Record<string, unknown>;
  tokenEstimate: number;
};

export type MarkdownHeading = {
  level: number;
  text: string;
};

export type MarkdownMetadata = {
  frontmatter?: Record<string, string | string[]>;
  headings: MarkdownHeading[];
  tags: string[];
  title: string | null;
  wikiLinks: string[];
};
