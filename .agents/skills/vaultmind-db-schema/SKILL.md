---
name: vaultmind-db-schema
description: Use when adding, changing, or reviewing Drizzle schema, migrations, database queries, or pgvector behavior.
---

# VaultMind DB Schema

The schema supports multi-source ingestion, local documents, scoped retrieval, cited chat history, articles, area discovery, and read-only MCP search.

## Core Tables

- `vaults`
- `workspace_indexes`
- `workspace_areas`
- `workspace_area_documents`
- `workspace_docs`
- `workspace_sources`
- `source_credentials`
- `documents`
- `document_chunks`
- `sync_jobs`
- `chat_sessions`
- `chat_messages`
- `retrieved_sources`
- `knowledge_events`
- `articles`
- `area_discovery_runs`
- `area_suggestions`
- `area_suggestion_documents`

## Rules

- Use `snake_case` for database tables and columns.
- Use `camelCase` for TypeScript, Drizzle properties, API payloads, and UI data.
- Keep SQL-to-TypeScript mapping explicit in the schema/query layer.
- Scope documents, chunks, sync jobs, and chat sessions to `workspaceIndexId` and its owning vault.
- Keep `workspace_sources.config` provider-specific, but never store secrets in it.
- Store provider credentials only in encrypted `source_credentials` rows.
- Use `sourceId + externalId` as the stable document uniqueness boundary.
- Store sync failure code and safe message separately as `error_code` and `error`.
- Keep the one-running-sync-per-source query logic and partial unique index aligned.
- Store `retrieved_sources` only for model response messages and link each row to `chat_messages.id`.
- Enable pgvector with `CREATE EXTENSION IF NOT EXISTS vector`.
- Use `vector(1536)` for `text-embedding-3-small` until a migration changes dimensions.
- Keep the HNSW cosine index aligned with vector search behavior.
- Content available to Ask AI must enter through `workspace_sources`, `documents`, and `document_chunks`; do not query feature tables directly at answer time.

## Query Guidance

- Prefer named helpers under `src/db/queries/`.
- Keep route handlers thin and delegate database logic.
- Never search chunks globally without an explicit vault or workspace scope.
- Save the user message, model response, and retrieved sources through query helpers or focused RAG orchestration.
- Workspace or source deletion may remove local indexed content, but must never modify the upstream provider.
- Do not leak database errors or stack traces to the UI.

## Validation Focus

Verify:

- the generated initial migration matches `src/db/schema.ts`;
- pgvector and the 1,536-dimensional vector column exist;
- cascade deletes remove chunks and retrieved sources as expected;
- sync lease constraints are preserved;
- query helpers preserve workspace and vault scoping;
- encrypted source credentials never appear in API responses or logs.
