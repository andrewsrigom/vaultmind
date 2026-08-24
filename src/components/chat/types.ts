import type { WorkspaceSourceType } from '@/db/schema';

export type ChatDisplayMessage = {
  content: string;
  id: string;
  role: 'assistant' | 'user';
};

export type ChatRetrievedSource = {
  chunkId: string;
  citationIndex: number;
  documentId: string;
  workspaceIndexId?: string | null;
  workspaceIndexName?: string | null;
  path: string;
  similarity: number;
  snippet: string;
  sourceId: string;
  sourceName: string;
  sourceType: WorkspaceSourceType;
  title: string;
};

export type ChatArticle = {
  content: string;
  id: string;
  question: string;
  sourceReferences: ChatRetrievedSource[];
  status: 'approved' | 'deprecated' | 'draft' | 'in-review' | 'needs-update';
  updatedAt: string;
};
