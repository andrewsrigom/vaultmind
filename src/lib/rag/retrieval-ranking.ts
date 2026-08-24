import type { RelevantChunk } from '@/lib/rag/search-relevant-chunks';

export type RetrievalDocumentAudience =
  | 'compliance'
  | 'engineering'
  | 'general'
  | 'operations'
  | 'support';

export type RetrievalDocumentScope = 'feature' | 'initiative' | 'repo' | 'team' | 'unknown';

export type RetrievalDocumentStatus =
  | 'deprecated'
  | 'draft'
  | 'local'
  | 'official'
  | 'template'
  | 'unknown';

export type RetrievalDocumentType =
  | 'agent-instruction'
  | 'compliance'
  | 'decision'
  | 'deployment-doc'
  | 'development-doc'
  | 'faq'
  | 'local-note'
  | 'overview'
  | 'policy'
  | 'release-note'
  | 'runbook'
  | 'storybook-doc'
  | 'technical-solution'
  | 'template'
  | 'test-doc'
  | 'unknown';

export type RetrievalQueryIntent =
  | 'artifact'
  | 'gap'
  | 'general'
  | 'how-to'
  | 'implementation'
  | 'overview'
  | 'policy'
  | 'support';

type RetrievalDocumentProfile = {
  audience: RetrievalDocumentAudience;
  scope: RetrievalDocumentScope;
  status: RetrievalDocumentStatus;
  type: RetrievalDocumentType;
};

type RankedChunk = {
  chunk: RelevantChunk;
  index: number;
  score: number;
};

const maxChunksPerDocument = 2;
const lexicalStopWords = new Set([
  'about',
  'and',
  'after',
  'before',
  'como',
  'devo',
  'does',
  'documents',
  'fazer',
  'for',
  'from',
  'have',
  'how',
  'para',
  'pergunta',
  'procedure',
  'process',
  'request',
  'should',
  'sobre',
  'that',
  'the',
  'this',
  'what',
  'when',
  'where',
  'with',
  'would',
]);

function normalizeText(value: string): string {
  return value.toLocaleLowerCase();
}

function getQueryTerms(query: string): string[] {
  const normalizedQuery = normalizeText(query);
  const terms = normalizedQuery.match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? [];

  return [...new Set(terms.filter((term) => !lexicalStopWords.has(term)))];
}

function getPathParts(path: string): {
  basename: string;
  normalizedPath: string;
} {
  const normalizedPath = normalizeText(path);
  const basename = normalizedPath.split('/').pop() ?? normalizedPath;

  return {
    basename,
    normalizedPath,
  };
}

function hasPathSegment(path: string, segment: string): boolean {
  return path.split('/').includes(segment);
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyRetrievalQuery(query: string): RetrievalQueryIntent {
  const normalizedQuery = normalizeText(query);

  if (
    matchesAny(normalizedQuery, [
      /\bwhat is (this|the) (project|repo|repository|codebase) (about|for)\b/u,
      /\bwhat does (this|the) (project|repo|repository|codebase) do\b/u,
      /\b(describe|explain) (this|the) (project|repo|repository|codebase)\b/u,
      /\b(project|repo|repository|codebase) overview\b/u,
      /\bo que (é|e) (este|esse|o) projeto\b/u,
      /\bsobre o que (é|e) (este|esse|o) projeto\b/u,
      /\bexplique (este|esse|o) projeto\b/u,
      /\bvis[aã]o geral (do|deste|desse) projeto\b/u,
    ])
  ) {
    return 'overview';
  }

  if (matchesAny(normalizedQuery, [/\b(gap|gaps|missing|lacuna|lacunas|faltando)\b/u])) {
    return 'gap';
  }

  if (
    matchesAny(normalizedQuery, [
      /\b(how to|how do i|how should|steps?|runbook|procedure|procedimento|passos?)\b/u,
    ])
  ) {
    return 'how-to';
  }

  if (
    matchesAny(normalizedQuery, [
      /\b(policy|compliance|contract|legal|privacy|bsa|aml|ofac|regulatory|pol[ií]tica)\b/u,
    ])
  ) {
    return 'policy';
  }

  if (
    matchesAny(normalizedQuery, [/\b(support|faq|member|customer support|atendimento|suporte)\b/u])
  ) {
    return 'support';
  }

  if (
    matchesAny(normalizedQuery, [
      /\b(implementation|architecture|technical|code|component|api|storybook|mock|design token)\b/u,
    ])
  ) {
    return 'implementation';
  }

  if (matchesAny(normalizedQuery, [/\b(generate|create|draft|artifact|artefato|gerar|criar)\b/u])) {
    return 'artifact';
  }

  return 'general';
}

export function isOverviewRetrievalQuery(query: string): boolean {
  return classifyRetrievalQuery(query) === 'overview';
}

function classifyDocumentType(path: string, title: string): RetrievalDocumentType {
  const { basename, normalizedPath } = getPathParts(path);
  const normalizedTitle = normalizeText(title);
  const searchableText = `${normalizedPath} ${normalizedTitle}`;

  if (
    hasPathSegment(normalizedPath, 'technical-solutions') ||
    searchableText.includes('technical solution')
  ) {
    return 'technical-solution';
  }

  if (hasPathSegment(normalizedPath, 'local-files')) {
    return 'local-note';
  }

  if (hasPathSegment(normalizedPath, '.agents') || normalizedPath.endsWith('agents.md')) {
    return 'agent-instruction';
  }

  if (searchableText.includes('template')) {
    return 'template';
  }

  if (basename === 'readme.md' || basename === 'readme.mdx' || basename.includes('overview')) {
    return 'overview';
  }

  if (searchableText.includes('policy')) {
    return 'policy';
  }

  if (
    searchableText.includes('compliance') ||
    searchableText.includes('ofac') ||
    searchableText.includes('bsa') ||
    searchableText.includes('aml')
  ) {
    return 'compliance';
  }

  if (searchableText.includes('runbook') || searchableText.includes('procedure')) {
    return 'runbook';
  }

  if (searchableText.includes('faq')) {
    return 'faq';
  }

  if (searchableText.includes('release')) {
    return 'release-note';
  }

  if (normalizedPath.includes('src/stories/docs/')) {
    return 'storybook-doc';
  }

  if (hasPathSegment(normalizedPath, 'tests') || hasPathSegment(normalizedPath, 'e2e')) {
    return 'test-doc';
  }

  if (normalizedPath.startsWith('docs/deployment/')) {
    return 'deployment-doc';
  }

  if (normalizedPath.startsWith('docs/development/')) {
    return 'development-doc';
  }

  if (searchableText.includes('decision') || searchableText.includes('adr')) {
    return 'decision';
  }

  return 'unknown';
}

function classifyDocumentStatus(path: string, title: string): RetrievalDocumentStatus {
  const searchableText = normalizeText(`${path} ${title}`);

  if (searchableText.includes('deprecated') || hasPathSegment(searchableText, 'archive')) {
    return 'deprecated';
  }

  if (searchableText.includes('template')) {
    return 'template';
  }

  if (hasPathSegment(searchableText, 'local-files')) {
    return 'local';
  }

  if (searchableText.includes('draft')) {
    return 'draft';
  }

  if (
    searchableText.includes('readme') ||
    searchableText.includes('policy') ||
    searchableText.includes('runbook') ||
    searchableText.includes('procedure') ||
    searchableText.includes('faq')
  ) {
    return 'official';
  }

  return 'unknown';
}

function classifyDocumentScope(path: string): RetrievalDocumentScope {
  const { basename, normalizedPath } = getPathParts(path);

  if (normalizedPath === 'readme.md' || normalizedPath === 'readme.mdx') {
    return 'repo';
  }

  if (
    hasPathSegment(normalizedPath, 'technical-solutions') ||
    hasPathSegment(normalizedPath, 'local-files') ||
    /\bitd[a-z]*-\d+/u.test(normalizedPath)
  ) {
    return 'initiative';
  }

  if (basename === 'readme.md' || basename === 'readme.mdx') {
    return 'feature';
  }

  if (hasPathSegment(normalizedPath, 'docs') || normalizedPath.includes('src/stories/docs/')) {
    return 'team';
  }

  return 'unknown';
}

function classifyDocumentAudience(path: string, title: string): RetrievalDocumentAudience {
  const searchableText = normalizeText(`${path} ${title}`);

  if (
    searchableText.includes('compliance') ||
    searchableText.includes('ofac') ||
    searchableText.includes('bsa') ||
    searchableText.includes('aml')
  ) {
    return 'compliance';
  }

  if (
    searchableText.includes('support') ||
    searchableText.includes('faq') ||
    searchableText.includes('member') ||
    searchableText.includes('customer')
  ) {
    return 'support';
  }

  if (searchableText.includes('operation') || searchableText.includes('runbook')) {
    return 'operations';
  }

  if (
    searchableText.includes('development') ||
    searchableText.includes('storybook') ||
    searchableText.includes('api') ||
    searchableText.includes('component') ||
    searchableText.includes('technical')
  ) {
    return 'engineering';
  }

  return 'general';
}

function classifyDocument(chunk: RelevantChunk): RetrievalDocumentProfile {
  return {
    audience: classifyDocumentAudience(chunk.path, chunk.title),
    scope: classifyDocumentScope(chunk.path),
    status: classifyDocumentStatus(chunk.path, chunk.title),
    type: classifyDocumentType(chunk.path, chunk.title),
  };
}

function getDocumentTypeBoost(
  intent: RetrievalQueryIntent,
  profile: RetrievalDocumentProfile,
): number {
  if (intent === 'overview') {
    if (profile.scope === 'repo') {
      return 3.5;
    }

    if (profile.type === 'overview') {
      return 1.4;
    }

    if (profile.scope === 'initiative') {
      return -2.2;
    }

    if (profile.type === 'technical-solution' || profile.type === 'local-note') {
      return -1.5;
    }
  }

  if (intent === 'implementation') {
    if (profile.type === 'technical-solution' || profile.type === 'development-doc') {
      return 1.3;
    }

    if (profile.type === 'storybook-doc' || profile.type === 'agent-instruction') {
      return 0.7;
    }
  }

  if (intent === 'how-to') {
    if (profile.type === 'runbook') {
      return 1.5;
    }

    if (profile.type === 'policy' || profile.type === 'compliance') {
      return 0.9;
    }

    if (profile.type === 'development-doc') {
      return 0.6;
    }

    if (profile.type === 'overview') {
      return -0.8;
    }
  }

  if (intent === 'policy') {
    if (profile.type === 'policy' || profile.type === 'compliance') {
      return 1.8;
    }

    if (profile.status === 'local' || profile.status === 'template') {
      return -1;
    }
  }

  if (intent === 'support') {
    if (profile.type === 'faq') {
      return 1.6;
    }

    if (profile.audience === 'support' || profile.type === 'runbook') {
      return 1;
    }
  }

  if (intent === 'gap') {
    if (profile.type === 'local-note' || profile.type === 'decision') {
      return 0.5;
    }

    if (profile.status === 'template') {
      return -0.4;
    }
  }

  if (intent === 'artifact') {
    if (profile.type === 'faq' || profile.type === 'runbook' || profile.type === 'overview') {
      return 0.8;
    }
  }

  return 0;
}

function getStatusBoost(status: RetrievalDocumentStatus): number {
  if (status === 'official') {
    return 0.25;
  }

  if (status === 'local') {
    return -0.35;
  }

  if (status === 'draft') {
    return -0.45;
  }

  if (status === 'template') {
    return -0.8;
  }

  if (status === 'deprecated') {
    return -1.5;
  }

  return 0;
}

function getLexicalBoost(
  chunk: RelevantChunk,
  intent: RetrievalQueryIntent,
  queryTerms: string[],
): number {
  if (queryTerms.length === 0) {
    return 0;
  }

  const searchableText = normalizeText(`${chunk.title} ${chunk.path} ${chunk.content}`);
  const matchedTerms = queryTerms.filter((term) => searchableText.includes(term));

  if (
    matchedTerms.length === 0 &&
    queryTerms.length >= 1 &&
    ['how-to', 'policy', 'support'].includes(intent)
  ) {
    return -0.7;
  }

  return Math.min(matchedTerms.length * 0.55, 1.6);
}

function scoreChunk(
  chunk: RelevantChunk,
  intent: RetrievalQueryIntent,
  queryTerms: string[],
): number {
  const profile = classifyDocument(chunk);

  return (
    chunk.similarity +
    getDocumentTypeBoost(intent, profile) +
    getStatusBoost(profile.status) +
    getLexicalBoost(chunk, intent, queryTerms)
  );
}

function compareRankedChunks(left: RankedChunk, right: RankedChunk): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.chunk.similarity !== right.chunk.similarity) {
    return right.chunk.similarity - left.chunk.similarity;
  }

  if (left.chunk.path !== right.chunk.path) {
    return left.chunk.path.localeCompare(right.chunk.path);
  }

  return left.index - right.index;
}

function applyDocumentDiversity(rankedChunks: RankedChunk[], limit: number): RelevantChunk[] {
  const documentCounts = new Map<string, number>();
  const selected: RankedChunk[] = [];
  const selectedIds = new Set<string>();

  for (const rankedChunk of rankedChunks) {
    const documentCount = documentCounts.get(rankedChunk.chunk.documentId) ?? 0;

    if (documentCount >= maxChunksPerDocument) {
      continue;
    }

    selected.push(rankedChunk);
    selectedIds.add(rankedChunk.chunk.chunkId);
    documentCounts.set(rankedChunk.chunk.documentId, documentCount + 1);

    if (selected.length >= limit) {
      return selected.map((item) => item.chunk);
    }
  }

  for (const rankedChunk of rankedChunks) {
    if (selectedIds.has(rankedChunk.chunk.chunkId)) {
      continue;
    }

    selected.push(rankedChunk);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected.map((item) => item.chunk);
}

export function rankRelevantChunksForQuery(
  rows: RelevantChunk[],
  query: string,
  limit: number,
): RelevantChunk[] {
  const intent = classifyRetrievalQuery(query);
  const queryTerms = getQueryTerms(query);
  const rankedChunks = rows
    .map((chunk, index) => ({
      chunk,
      index,
      score: scoreChunk(chunk, intent, queryTerms),
    }))
    .sort(compareRankedChunks);

  return applyDocumentDiversity(rankedChunks, limit);
}
