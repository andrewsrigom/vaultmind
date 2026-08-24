CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE TYPE "public"."area_discovery_run_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."area_suggestion_status" AS ENUM('suggested', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'in-review', 'approved', 'needs-update', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."knowledge_event_type" AS ENUM('question-asked', 'answer-generated', 'answer-refused', 'source-cited', 'trust-signal-submitted', 'article-created', 'source-synced', 'source-sync-failed');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workspace_area_origin" AS ENUM('ai-discovered', 'manual', 'seeded');--> statement-breakpoint
CREATE TYPE "public"."workspace_doc_status" AS ENUM('draft', 'published', 'in-review', 'needs-update', 'open', 'resolved', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."workspace_doc_type" AS ENUM('note', 'article', 'guide');--> statement-breakpoint
CREATE TYPE "public"."workspace_source_type" AS ENUM('github', 'notion', 'google-drive', 'workspace-doc');--> statement-breakpoint
CREATE TABLE "area_discovery_runs" (
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"error_code" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text,
	"started_at" timestamp with time zone,
	"status" "area_discovery_run_status" DEFAULT 'queued' NOT NULL,
	"summary" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "area_suggestion_documents" (
	"confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"run_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "area_suggestions" (
	"confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"promoted_area_id" uuid,
	"reason" text NOT NULL,
	"run_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"status" "area_suggestion_status" DEFAULT 'suggested' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"source_assistant_message_id" uuid,
	"source_chat_session_id" uuid,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" uuid NOT NULL,
	"workspace_area_id" uuid,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"chat_session_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "chat_message_role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metadata" jsonb,
	"source_id" uuid NOT NULL,
	"token_estimate" integer NOT NULL,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_metadata" jsonb,
	"source_type" "workspace_source_type" NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_events" (
	"chat_message_id" uuid,
	"chat_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metadata" jsonb,
	"source_id" uuid,
	"type" "knowledge_event_type" NOT NULL,
	"vault_id" uuid NOT NULL,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retrieved_sources" (
	"chat_message_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"similarity" real NOT NULL,
	"snippet" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_credentials" (
	"account_id" text,
	"account_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"expires_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "workspace_source_type" NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"chunks_created" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"documents_created" integer DEFAULT 0 NOT NULL,
	"documents_deleted" integer DEFAULT 0 NOT NULL,
	"documents_found" integer DEFAULT 0 NOT NULL,
	"documents_updated" integer DEFAULT 0 NOT NULL,
	"error" text,
	"error_code" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"skipped_unchanged" integer DEFAULT 0 NOT NULL,
	"source_id" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"status" "sync_job_status" DEFAULT 'pending' NOT NULL,
	"workspace_index_id" uuid NOT NULL,
	CONSTRAINT "sync_jobs_running_has_lease_check" CHECK ("sync_jobs"."status" <> 'running' OR "sync_jobs"."lease_expires_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "vaults" ("description", "id", "name", "slug") VALUES ('Self-hosted knowledge vault.', '00000000-0000-4000-8000-000000000001', 'VaultMind', 'vault') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
CREATE TABLE "workspace_area_documents" (
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text,
	"vault_id" uuid NOT NULL,
	"workspace_area_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_areas" (
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"icon" text DEFAULT 'folder' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"origin" "workspace_area_origin" DEFAULT 'ai-discovered' NOT NULL,
	"reason" text,
	"slug" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_docs" (
	"archived_at" timestamp with time zone,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"doc_type" "workspace_doc_type" DEFAULT 'note' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"include_in_ask_ai" boolean DEFAULT false NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_doc_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"published_content" text,
	"published_title" text,
	"slug" text NOT NULL,
	"status" "workspace_doc_status" DEFAULT 'draft' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" uuid NOT NULL,
	"workspace_area_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_indexes" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_sources" (
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_external_version" text,
	"last_synced_at" timestamp with time zone,
	"name" text NOT NULL,
	"type" "workspace_source_type" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_index_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "area_discovery_runs" ADD CONSTRAINT "area_discovery_runs_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_suggestion_documents" ADD CONSTRAINT "area_suggestion_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_suggestion_documents" ADD CONSTRAINT "area_suggestion_documents_run_id_area_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."area_discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_suggestion_documents" ADD CONSTRAINT "area_suggestion_documents_suggestion_id_area_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."area_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_suggestion_documents" ADD CONSTRAINT "area_suggestion_documents_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_suggestions" ADD CONSTRAINT "area_suggestions_promoted_area_id_workspace_areas_id_fk" FOREIGN KEY ("promoted_area_id") REFERENCES "public"."workspace_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_suggestions" ADD CONSTRAINT "area_suggestions_run_id_area_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."area_discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_suggestions" ADD CONSTRAINT "area_suggestions_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_assistant_message_id_chat_messages_id_fk" FOREIGN KEY ("source_assistant_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("source_chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_workspace_area_id_workspace_areas_id_fk" FOREIGN KEY ("workspace_area_id") REFERENCES "public"."workspace_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_source_id_workspace_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."workspace_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_id_workspace_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."workspace_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_source_id_workspace_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."workspace_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieved_sources" ADD CONSTRAINT "retrieved_sources_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieved_sources" ADD CONSTRAINT "retrieved_sources_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieved_sources" ADD CONSTRAINT "retrieved_sources_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_credentials" ADD CONSTRAINT "source_credentials_source_id_workspace_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."workspace_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_source_id_workspace_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."workspace_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_area_documents" ADD CONSTRAINT "workspace_area_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_area_documents" ADD CONSTRAINT "workspace_area_documents_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_area_documents" ADD CONSTRAINT "workspace_area_documents_workspace_area_id_workspace_areas_id_fk" FOREIGN KEY ("workspace_area_id") REFERENCES "public"."workspace_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_areas" ADD CONSTRAINT "workspace_areas_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_docs" ADD CONSTRAINT "workspace_docs_parent_doc_id_workspace_docs_id_fk" FOREIGN KEY ("parent_doc_id") REFERENCES "public"."workspace_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_docs" ADD CONSTRAINT "workspace_docs_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_docs" ADD CONSTRAINT "workspace_docs_workspace_area_id_workspace_areas_id_fk" FOREIGN KEY ("workspace_area_id") REFERENCES "public"."workspace_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_indexes" ADD CONSTRAINT "workspace_indexes_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sources" ADD CONSTRAINT "workspace_sources_workspace_index_id_workspace_indexes_id_fk" FOREIGN KEY ("workspace_index_id") REFERENCES "public"."workspace_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_discovery_runs_created_at_idx" ON "area_discovery_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "area_discovery_runs_workspace_index_id_idx" ON "area_discovery_runs" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE INDEX "area_discovery_runs_status_idx" ON "area_discovery_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "area_suggestion_documents_document_id_idx" ON "area_suggestion_documents" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "area_suggestion_documents_workspace_index_id_idx" ON "area_suggestion_documents" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE INDEX "area_suggestion_documents_run_id_idx" ON "area_suggestion_documents" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "area_suggestion_documents_suggestion_id_idx" ON "area_suggestion_documents" USING btree ("suggestion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "area_suggestion_documents_unique" ON "area_suggestion_documents" USING btree ("suggestion_id","document_id");--> statement-breakpoint
CREATE INDEX "area_suggestions_workspace_index_id_idx" ON "area_suggestions" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE INDEX "area_suggestions_promoted_area_id_idx" ON "area_suggestions" USING btree ("promoted_area_id");--> statement-breakpoint
CREATE INDEX "area_suggestions_run_id_idx" ON "area_suggestions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "area_suggestions_status_idx" ON "area_suggestions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "area_suggestions_run_sort_order_unique" ON "area_suggestions" USING btree ("run_id","sort_order");--> statement-breakpoint
CREATE INDEX "articles_workspace_area_id_idx" ON "articles" USING btree ("workspace_area_id");--> statement-breakpoint
CREATE INDEX "articles_workspace_index_id_idx" ON "articles" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE INDEX "articles_vault_id_idx" ON "articles" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_source_assistant_message_id_unique" ON "articles" USING btree ("source_assistant_message_id");--> statement-breakpoint
CREATE INDEX "chat_messages_chat_session_id_idx" ON "chat_messages" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_workspace_index_id_idx" ON "chat_sessions" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_updated_at_idx" ON "chat_sessions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_chunks_embedding_hnsw_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "document_chunks_workspace_index_id_idx" ON "document_chunks" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE INDEX "document_chunks_source_id_idx" ON "document_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "documents_workspace_index_id_idx" ON "documents" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE INDEX "documents_path_idx" ON "documents" USING btree ("path");--> statement-breakpoint
CREATE INDEX "documents_source_id_idx" ON "documents" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_source_external_id_unique" ON "documents" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "knowledge_events_chat_message_id_idx" ON "knowledge_events" USING btree ("chat_message_id");--> statement-breakpoint
CREATE INDEX "knowledge_events_chat_session_id_idx" ON "knowledge_events" USING btree ("chat_session_id");--> statement-breakpoint
CREATE INDEX "knowledge_events_created_at_idx" ON "knowledge_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_events_workspace_index_id_idx" ON "knowledge_events" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE INDEX "knowledge_events_vault_id_idx" ON "knowledge_events" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "knowledge_events_source_id_idx" ON "knowledge_events" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_events_type_idx" ON "knowledge_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "retrieved_sources_chat_message_id_idx" ON "retrieved_sources" USING btree ("chat_message_id");--> statement-breakpoint
CREATE INDEX "retrieved_sources_chunk_id_idx" ON "retrieved_sources" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "retrieved_sources_document_id_idx" ON "retrieved_sources" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "source_credentials_provider_idx" ON "source_credentials" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "source_credentials_source_id_unique" ON "source_credentials" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_workspace_index_id_idx" ON "sync_jobs" USING btree ("workspace_index_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_jobs_one_running_per_source_unique" ON "sync_jobs" USING btree ("source_id") WHERE "sync_jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "sync_jobs_source_id_idx" ON "sync_jobs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_status_idx" ON "sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "vaults_slug_unique" ON "vaults" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "vaults_updated_at_idx" ON "vaults" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "workspace_area_documents_document_id_idx" ON "workspace_area_documents" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "workspace_area_documents_vault_id_idx" ON "workspace_area_documents" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "workspace_area_documents_workspace_area_id_idx" ON "workspace_area_documents" USING btree ("workspace_area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_area_documents_unique" ON "workspace_area_documents" USING btree ("workspace_area_id","document_id");--> statement-breakpoint
CREATE INDEX "workspace_areas_vault_id_idx" ON "workspace_areas" USING btree ("vault_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_areas_vault_slug_unique" ON "workspace_areas" USING btree ("vault_id","slug");--> statement-breakpoint
CREATE INDEX "workspace_docs_vault_id_idx" ON "workspace_docs" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "workspace_docs_workspace_area_id_idx" ON "workspace_docs" USING btree ("workspace_area_id");--> statement-breakpoint
CREATE INDEX "workspace_docs_parent_doc_id_idx" ON "workspace_docs" USING btree ("parent_doc_id");--> statement-breakpoint
CREATE INDEX "workspace_docs_doc_type_idx" ON "workspace_docs" USING btree ("doc_type");--> statement-breakpoint
CREATE INDEX "workspace_docs_status_idx" ON "workspace_docs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspace_docs_updated_at_idx" ON "workspace_docs" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_docs_root_slug_unique" ON "workspace_docs" USING btree ("vault_id","workspace_area_id","slug") WHERE "workspace_docs"."parent_doc_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_docs_child_slug_unique" ON "workspace_docs" USING btree ("vault_id","workspace_area_id","parent_doc_id","slug") WHERE "workspace_docs"."parent_doc_id" is not null;--> statement-breakpoint
CREATE INDEX "workspace_indexes_vault_id_idx" ON "workspace_indexes" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "workspace_sources_workspace_index_id_idx" ON "workspace_sources" USING btree ("workspace_index_id");
