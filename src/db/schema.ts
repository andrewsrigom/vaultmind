import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export const chatMessageRoles = ['user', 'assistant'] as const;
export const syncableWorkspaceSourceTypes = ['github', 'notion', 'google-drive'] as const;
export const workspaceSourceTypes = ['github', 'notion', 'google-drive', 'workspace-doc'] as const;
export const areaDiscoveryRunStatuses = ['queued', 'running', 'completed', 'failed'] as const;
export const areaSuggestionStatuses = ['suggested', 'accepted', 'rejected'] as const;
export const workspaceAreaOrigins = ['ai-discovered', 'manual', 'seeded'] as const;
export const workspaceDocTypes = ['note', 'article', 'guide'] as const;
export const workspaceDocStatuses = [
  'draft',
  'published',
  'in-review',
  'needs-update',
  'open',
  'resolved',
  'deprecated',
] as const;
export const workspaceAreaIconNames = [
  'folder',
  'book-open',
  'briefcase',
  'chart',
  'coins',
  'heart',
  'life-buoy',
  'megaphone',
  'scale',
  'shield',
  'sparkles',
  'users',
  'wrench',
] as const;
export const knowledgeEventTypes = [
  'question-asked',
  'answer-generated',
  'answer-refused',
  'source-cited',
  'trust-signal-submitted',
  'article-created',
  'source-synced',
  'source-sync-failed',
] as const;
export const articleStatuses = [
  'draft',
  'in-review',
  'approved',
  'needs-update',
  'deprecated',
] as const;
export const syncJobStatuses = ['pending', 'running', 'completed', 'failed'] as const;
export const trustSignalTypes = [
  'helpful',
  'not-helpful',
  'missing-source',
  'outdated',
  'conflicting',
  'wrong-scope',
] as const;
export const defaultVaultId = '00000000-0000-4000-8000-000000000001';
export const defaultVaultSlug = 'vault';
export const defaultVaultName = 'VaultMind';
export const defaultVaultDescription = 'Self-hosted knowledge vault.';

export const areaDiscoveryRunStatusEnum = pgEnum(
  'area_discovery_run_status',
  areaDiscoveryRunStatuses,
);
export const areaSuggestionStatusEnum = pgEnum('area_suggestion_status', areaSuggestionStatuses);
export const workspaceAreaOriginEnum = pgEnum('workspace_area_origin', workspaceAreaOrigins);
export const workspaceDocTypeEnum = pgEnum('workspace_doc_type', workspaceDocTypes);
export const workspaceDocStatusEnum = pgEnum('workspace_doc_status', workspaceDocStatuses);
export const articleStatusEnum = pgEnum('article_status', articleStatuses);
export const chatMessageRoleEnum = pgEnum('chat_message_role', chatMessageRoles);
export const knowledgeEventTypeEnum = pgEnum('knowledge_event_type', knowledgeEventTypes);
export const workspaceSourceTypeEnum = pgEnum('workspace_source_type', workspaceSourceTypes);
export const syncJobStatusEnum = pgEnum('sync_job_status', syncJobStatuses);
export type ChatMessageRole = (typeof chatMessageRoles)[number];
export type KnowledgeEventType = (typeof knowledgeEventTypes)[number];
export type TrustSignalType = (typeof trustSignalTypes)[number];
export type AreaDiscoveryRunStatus = (typeof areaDiscoveryRunStatuses)[number];
export type AreaSuggestionStatus = (typeof areaSuggestionStatuses)[number];
export type WorkspaceAreaOrigin = (typeof workspaceAreaOrigins)[number];
export type WorkspaceAreaIconName = (typeof workspaceAreaIconNames)[number];
export type ArticleStatus = (typeof articleStatuses)[number];
export type WorkspaceDocType = (typeof workspaceDocTypes)[number];
export type WorkspaceDocStatus = (typeof workspaceDocStatuses)[number];
export type GitHubSourceConfig = {
  branch: string;
  excludePaths?: string[];
  includePaths?: string[];
  owner: string;
  repo: string;
  repoUrl: string;
};
export type NotionSourceResourceType = 'data-source' | 'database' | 'page';
export type NotionSourceResource = {
  externalId: string;
  lastEditedTime?: string;
  title: string;
  type: NotionSourceResourceType;
  url?: string;
};
export type NotionSourceConfig = {
  connectionId?: string;
  resources: NotionSourceResource[];
  workspaceId?: string;
  workspaceName?: string;
};
export type GoogleDriveSourceResourceType = 'document' | 'file' | 'folder';
export type GoogleDriveSourceResource = {
  externalId: string;
  mimeType: string;
  modifiedTime?: string;
  title: string;
  type: GoogleDriveSourceResourceType;
  url?: string;
};
export type GoogleDriveSourceConfig = {
  resources: GoogleDriveSourceResource[];
};
export type WorkspaceDocSourceConfig = {
  generatedBy: 'vaultmind-docs';
  readonly: true;
};
export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type WorkspaceSourceType = (typeof workspaceSourceTypes)[number];
export type ArticleSourceReference = {
  chunkId: string;
  citationIndex: number;
  documentId: string;
  path: string;
  similarity: number;
  snippet: string;
  sourceId: string;
  sourceMetadata?: JsonValue;
  sourceName: string;
  sourceType: WorkspaceSourceType;
  title: string;
};
export type SyncableWorkspaceSourceType = (typeof syncableWorkspaceSourceTypes)[number];
export type WorkspaceSourceConfig =
  | GoogleDriveSourceConfig
  | GitHubSourceConfig
  | NotionSourceConfig
  | WorkspaceDocSourceConfig;
export type SyncJobStatus = (typeof syncJobStatuses)[number];

export const embeddingVector = customType<{
  config: { dimensions: number };
  configRequired: true;
  data: number[];
  driverData: string;
}>({
  dataType(config) {
    return `vector(${config.dimensions})`;
  },
  fromDriver(value) {
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .filter((dimension) => dimension.length > 0)
      .map((dimension) => Number(dimension));
  },
  toDriver(value) {
    return `[${value.join(',')}]`;
  },
});

export const vaults = pgTable(
  'vaults',
  {
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    description: text('description'),
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('vaults_slug_unique').on(table.slug),
    index('vaults_updated_at_idx').on(table.updatedAt),
  ],
);

export const workspaceIndexes = pgTable(
  'workspace_indexes',
  {
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    description: text('description'),
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    vaultId: uuid('vault_id')
      .default(sql`'00000000-0000-4000-8000-000000000001'::uuid`)
      .notNull()
      .references(() => vaults.id, { onDelete: 'restrict' }),
  },
  (table) => [index('workspace_indexes_vault_id_idx').on(table.vaultId)],
);

export const workspaceAreas = pgTable(
  'workspace_areas',
  {
    confidence: real('confidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    description: text('description'),
    icon: text('icon').$type<WorkspaceAreaIconName>().default('folder').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    origin: workspaceAreaOriginEnum('origin').default('ai-discovered').notNull(),
    reason: text('reason'),
    slug: text('slug').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    vaultId: uuid('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('workspace_areas_vault_id_idx').on(table.vaultId),
    uniqueIndex('workspace_areas_vault_slug_unique').on(table.vaultId, table.slug),
  ],
);

export const workspaceDocs = pgTable(
  'workspace_docs',
  {
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    content: text('content').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    docType: workspaceDocTypeEnum('doc_type').default('note').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    includeInAskAi: boolean('include_in_ask_ai').default(false).notNull(),
    isFavorite: boolean('is_favorite').default(false).notNull(),
    metadata: jsonb('metadata')
      .$type<JsonValue>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    parentDocId: uuid('parent_doc_id').references((): AnyPgColumn => workspaceDocs.id, {
      onDelete: 'cascade',
    }),
    position: integer('position').default(0).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedContent: text('published_content'),
    publishedTitle: text('published_title'),
    slug: text('slug').notNull(),
    status: workspaceDocStatusEnum('status').default('draft').notNull(),
    tags: jsonb('tags')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    title: text('title').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    vaultId: uuid('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    workspaceAreaId: uuid('workspace_area_id')
      .notNull()
      .references(() => workspaceAreas.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('workspace_docs_vault_id_idx').on(table.vaultId),
    index('workspace_docs_workspace_area_id_idx').on(table.workspaceAreaId),
    index('workspace_docs_parent_doc_id_idx').on(table.parentDocId),
    index('workspace_docs_doc_type_idx').on(table.docType),
    index('workspace_docs_status_idx').on(table.status),
    index('workspace_docs_updated_at_idx').on(table.updatedAt),
    uniqueIndex('workspace_docs_root_slug_unique')
      .on(table.vaultId, table.workspaceAreaId, table.slug)
      .where(sql`${table.parentDocId} is null`),
    uniqueIndex('workspace_docs_child_slug_unique')
      .on(table.vaultId, table.workspaceAreaId, table.parentDocId, table.slug)
      .where(sql`${table.parentDocId} is not null`),
  ],
);

export const workspaceSources = pgTable(
  'workspace_sources',
  {
    config: jsonb('config').$type<WorkspaceSourceConfig>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    lastExternalVersion: text('last_external_version'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    name: text('name').notNull(),
    type: workspaceSourceTypeEnum('type').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [index('workspace_sources_workspace_index_id_idx').on(table.workspaceIndexId)],
);

export const sourceCredentials = pgTable(
  'source_credentials',
  {
    accountId: text('account_id'),
    accountName: text('account_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    id: uuid('id').defaultRandom().primaryKey(),
    provider: workspaceSourceTypeEnum('provider').notNull(),
    scopes: jsonb('scopes')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => workspaceSources.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('source_credentials_provider_idx').on(table.provider),
    uniqueIndex('source_credentials_source_id_unique').on(table.sourceId),
  ],
);

export const documents = pgTable(
  'documents',
  {
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    externalId: text('external_id').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    path: text('path').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => workspaceSources.id, { onDelete: 'cascade' }),
    sourceMetadata: jsonb('source_metadata').$type<JsonValue>(),
    sourceType: workspaceSourceTypeEnum('source_type').notNull(),
    title: text('title').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('documents_workspace_index_id_idx').on(table.workspaceIndexId),
    index('documents_path_idx').on(table.path),
    index('documents_source_id_idx').on(table.sourceId),
    uniqueIndex('documents_source_external_id_unique').on(table.sourceId, table.externalId),
  ],
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    embedding: embeddingVector('embedding', { dimensions: 1536 }).notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    metadata: jsonb('metadata').$type<JsonValue>(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => workspaceSources.id, { onDelete: 'cascade' }),
    tokenEstimate: integer('token_estimate').notNull(),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('document_chunks_document_id_idx').on(table.documentId),
    index('document_chunks_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    index('document_chunks_workspace_index_id_idx').on(table.workspaceIndexId),
    index('document_chunks_source_id_idx').on(table.sourceId),
  ],
);

export const syncJobs = pgTable(
  'sync_jobs',
  {
    chunksCreated: integer('chunks_created').default(0).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    documentsCreated: integer('documents_created').default(0).notNull(),
    documentsDeleted: integer('documents_deleted').default(0).notNull(),
    documentsFound: integer('documents_found').default(0).notNull(),
    documentsUpdated: integer('documents_updated').default(0).notNull(),
    error: text('error'),
    errorCode: text('error_code'),
    id: uuid('id').defaultRandom().primaryKey(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    skippedUnchanged: integer('skipped_unchanged').default(0).notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => workspaceSources.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    status: syncJobStatusEnum('status').default('pending').notNull(),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    check(
      'sync_jobs_running_has_lease_check',
      sql`${table.status} <> 'running' OR ${table.leaseExpiresAt} IS NOT NULL`,
    ),
    index('sync_jobs_workspace_index_id_idx').on(table.workspaceIndexId),
    uniqueIndex('sync_jobs_one_running_per_source_unique')
      .on(table.sourceId)
      .where(sql`${table.status} = 'running'`),
    index('sync_jobs_source_id_idx').on(table.sourceId),
    index('sync_jobs_status_idx').on(table.status),
  ],
);

export const areaDiscoveryRuns = pgTable(
  'area_discovery_runs',
  {
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    error: text('error'),
    errorCode: text('error_code'),
    id: uuid('id').defaultRandom().primaryKey(),
    model: text('model'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    status: areaDiscoveryRunStatusEnum('status').default('queued').notNull(),
    summary: text('summary'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('area_discovery_runs_created_at_idx').on(table.createdAt),
    index('area_discovery_runs_workspace_index_id_idx').on(table.workspaceIndexId),
    index('area_discovery_runs_status_idx').on(table.status),
  ],
);

export const areaSuggestions = pgTable(
  'area_suggestions',
  {
    confidence: real('confidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    description: text('description').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    promotedAreaId: uuid('promoted_area_id').references(() => workspaceAreas.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),
    runId: uuid('run_id')
      .notNull()
      .references(() => areaDiscoveryRuns.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    status: areaSuggestionStatusEnum('status').default('suggested').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('area_suggestions_workspace_index_id_idx').on(table.workspaceIndexId),
    index('area_suggestions_promoted_area_id_idx').on(table.promotedAreaId),
    index('area_suggestions_run_id_idx').on(table.runId),
    index('area_suggestions_status_idx').on(table.status),
    uniqueIndex('area_suggestions_run_sort_order_unique').on(table.runId, table.sortOrder),
  ],
);

export const workspaceAreaDocuments = pgTable(
  'workspace_area_documents',
  {
    confidence: real('confidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    id: uuid('id').defaultRandom().primaryKey(),
    reason: text('reason'),
    vaultId: uuid('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    workspaceAreaId: uuid('workspace_area_id')
      .notNull()
      .references(() => workspaceAreas.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('workspace_area_documents_document_id_idx').on(table.documentId),
    index('workspace_area_documents_vault_id_idx').on(table.vaultId),
    index('workspace_area_documents_workspace_area_id_idx').on(table.workspaceAreaId),
    uniqueIndex('workspace_area_documents_unique').on(table.workspaceAreaId, table.documentId),
  ],
);

export const areaSuggestionDocuments = pgTable(
  'area_suggestion_documents',
  {
    confidence: real('confidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    id: uuid('id').defaultRandom().primaryKey(),
    reason: text('reason').notNull(),
    runId: uuid('run_id')
      .notNull()
      .references(() => areaDiscoveryRuns.id, { onDelete: 'cascade' }),
    suggestionId: uuid('suggestion_id')
      .notNull()
      .references(() => areaSuggestions.id, { onDelete: 'cascade' }),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('area_suggestion_documents_document_id_idx').on(table.documentId),
    index('area_suggestion_documents_workspace_index_id_idx').on(table.workspaceIndexId),
    index('area_suggestion_documents_run_id_idx').on(table.runId),
    index('area_suggestion_documents_suggestion_id_idx').on(table.suggestionId),
    uniqueIndex('area_suggestion_documents_unique').on(table.suggestionId, table.documentId),
  ],
);

export const chatSessions = pgTable(
  'chat_sessions',
  {
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    title: text('title').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('chat_sessions_workspace_index_id_idx').on(table.workspaceIndexId),
    index('chat_sessions_updated_at_idx').on(table.updatedAt),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    chatSessionId: uuid('chat_session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    role: chatMessageRoleEnum('role').notNull(),
  },
  (table) => [index('chat_messages_chat_session_id_idx').on(table.chatSessionId)],
);

export const retrievedSources = pgTable(
  'retrieved_sources',
  {
    chatMessageId: uuid('chat_message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id')
      .notNull()
      .references(() => documentChunks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    id: uuid('id').defaultRandom().primaryKey(),
    similarity: real('similarity').notNull(),
    snippet: text('snippet').notNull(),
  },
  (table) => [
    index('retrieved_sources_chat_message_id_idx').on(table.chatMessageId),
    index('retrieved_sources_chunk_id_idx').on(table.chunkId),
    index('retrieved_sources_document_id_idx').on(table.documentId),
  ],
);

export const articles = pgTable(
  'articles',
  {
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    question: text('question').notNull(),
    sourceAssistantMessageId: uuid('source_assistant_message_id').references(
      () => chatMessages.id,
      { onDelete: 'set null' },
    ),
    sourceChatSessionId: uuid('source_chat_session_id').references(() => chatSessions.id, {
      onDelete: 'set null',
    }),
    sourceReferences: jsonb('source_references')
      .$type<ArticleSourceReference[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    status: articleStatusEnum('status').default('draft').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    vaultId: uuid('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    workspaceAreaId: uuid('workspace_area_id').references(() => workspaceAreas.id, {
      onDelete: 'set null',
    }),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('articles_workspace_area_id_idx').on(table.workspaceAreaId),
    index('articles_workspace_index_id_idx').on(table.workspaceIndexId),
    index('articles_vault_id_idx').on(table.vaultId),
    index('articles_status_idx').on(table.status),
    index('articles_updated_at_idx').on(table.updatedAt),
    uniqueIndex('articles_source_assistant_message_id_unique').on(table.sourceAssistantMessageId),
  ],
);

export const knowledgeEvents = pgTable(
  'knowledge_events',
  {
    chatMessageId: uuid('chat_message_id').references(() => chatMessages.id, {
      onDelete: 'set null',
    }),
    chatSessionId: uuid('chat_session_id').references(() => chatSessions.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    metadata: jsonb('metadata').$type<JsonValue>(),
    sourceId: uuid('source_id').references(() => workspaceSources.id, {
      onDelete: 'set null',
    }),
    type: knowledgeEventTypeEnum('type').notNull(),
    vaultId: uuid('vault_id')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    workspaceIndexId: uuid('workspace_index_id')
      .notNull()
      .references(() => workspaceIndexes.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('knowledge_events_chat_message_id_idx').on(table.chatMessageId),
    index('knowledge_events_chat_session_id_idx').on(table.chatSessionId),
    index('knowledge_events_created_at_idx').on(table.createdAt),
    index('knowledge_events_workspace_index_id_idx').on(table.workspaceIndexId),
    index('knowledge_events_vault_id_idx').on(table.vaultId),
    index('knowledge_events_source_id_idx').on(table.sourceId),
    index('knowledge_events_type_idx').on(table.type),
  ],
);

export type AreaDiscoveryRun = InferSelectModel<typeof areaDiscoveryRuns>;
export type AreaSuggestion = InferSelectModel<typeof areaSuggestions>;
export type AreaSuggestionDocument = InferSelectModel<typeof areaSuggestionDocuments>;
export type WorkspaceArea = InferSelectModel<typeof workspaceAreas>;
export type WorkspaceAreaDocument = InferSelectModel<typeof workspaceAreaDocuments>;
export type WorkspaceDoc = InferSelectModel<typeof workspaceDocs>;
export type Article = InferSelectModel<typeof articles>;
export type ChatMessage = InferSelectModel<typeof chatMessages>;
export type ChatSession = InferSelectModel<typeof chatSessions>;
export type Document = InferSelectModel<typeof documents>;
export type DocumentChunk = InferSelectModel<typeof documentChunks>;
export type SourceCredential = InferSelectModel<typeof sourceCredentials>;
export type WorkspaceIndex = InferSelectModel<typeof workspaceIndexes>;
export type KnowledgeEvent = InferSelectModel<typeof knowledgeEvents>;
export type WorkspaceSource = InferSelectModel<typeof workspaceSources>;
export type Vault = InferSelectModel<typeof vaults>;
export type NewAreaDiscoveryRun = InferInsertModel<typeof areaDiscoveryRuns>;
export type NewAreaSuggestion = InferInsertModel<typeof areaSuggestions>;
export type NewAreaSuggestionDocument = InferInsertModel<typeof areaSuggestionDocuments>;
export type NewWorkspaceArea = InferInsertModel<typeof workspaceAreas>;
export type NewWorkspaceAreaDocument = InferInsertModel<typeof workspaceAreaDocuments>;
export type NewWorkspaceDoc = InferInsertModel<typeof workspaceDocs>;
export type NewArticle = InferInsertModel<typeof articles>;
export type NewChatMessage = InferInsertModel<typeof chatMessages>;
export type NewChatSession = InferInsertModel<typeof chatSessions>;
export type NewDocument = InferInsertModel<typeof documents>;
export type NewDocumentChunk = InferInsertModel<typeof documentChunks>;
export type NewSourceCredential = InferInsertModel<typeof sourceCredentials>;
export type NewWorkspaceIndex = InferInsertModel<typeof workspaceIndexes>;
export type NewKnowledgeEvent = InferInsertModel<typeof knowledgeEvents>;
export type NewWorkspaceSource = InferInsertModel<typeof workspaceSources>;
export type NewVault = InferInsertModel<typeof vaults>;
export type NewRetrievedSource = InferInsertModel<typeof retrievedSources>;
export type NewSyncJob = InferInsertModel<typeof syncJobs>;
export type RetrievedSource = InferSelectModel<typeof retrievedSources>;
export type SyncJob = InferSelectModel<typeof syncJobs>;
