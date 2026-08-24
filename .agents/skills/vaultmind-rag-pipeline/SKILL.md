---
name: vaultmind-rag-pipeline
description: Use when implementing or reviewing Markdown metadata extraction, chunking, embeddings, ingestion, vector search, prompt building, or answer generation.
---

# VaultMind RAG Pipeline

The RAG pipeline must be source-agnostic. It accepts normalized
`SourceDocument[]` and must not depend on GitHub, Notion, Next.js pages, or UI
components.

## Boundaries

- Keep RAG code under `src/lib/rag/`.
- Keep OpenAI-specific logic behind provider interfaces in `src/lib/providers/`.
- Keep database writes in query helpers or ingestion functions, not UI components.
- Always filter retrieval by `workspaceIndexId`.

## Ingestion Rules

- Hash content with SHA-256.
- Use `text-embedding-3-small` as the supported embedding model for the current schema.
- Validate that embedding vectors have 1536 dimensions before writing them to `document_chunks`.
- Skip unchanged documents by `sourceId + externalId + contentHash`.
- Reindex changed documents by replacing old chunks.
- Delete documents missing from the latest sync payload and rely on cascade deletion for chunks.
- Represent published VaultMind documents in Ask AI as `workspace_sources` plus
  `documents` and `document_chunks`; do not special-case retrieval from
  `workspace_docs` at answer time.
- Use stable internal `externalId` values such as `workspace-doc:{id}`, and
  delete indexed rows when the document is excluded, archived, or removed.
- Internal Ask AI indexers should make the target `workspaceIndexId` explicit in
  tests to avoid cross-test interference.
- Store full content locally in the current release, but never commit dumps or fixtures with private content.
- Keep ingestion idempotent for unchanged sync payloads.
- Replace one document's chunks in a transaction when practical.
- Use provider timeouts and limited retry for transient OpenAI failures.
- Do not log raw content, prompts, embeddings, or provider headers.

## Retrieval And Answer Rules

- Use query embeddings and pgvector cosine distance.
- Return similarity as `1 - cosine_distance`.
- Build prompts that require answers only from retrieved context.
- If context is insufficient, the answer should say the indexed context does not contain enough information.
- Do not instantiate the chat provider when a workspace index has no indexed chunks; return the safe insufficient-context answer instead.
- Do not include raw similarity scores in generated answers; show them only in UI source panels.
- Chat supports streaming responses; keep the complete JSON path as a fallback contract.
- Keep prompt context under a safe budget; drop least similar chunks before truncating content.
- Save one user message, one model response, and response-linked retrieved sources for each answered question.

## Evaluation

- Keep `src/lib/rag/docs-vault-evaluation.test.ts` aligned with the public docs
  vault expectations in README/roadmap when retrieval behavior changes.
- Include expected source files for known questions.
- Include at least one insufficient-context question.
- Prefer source/behavior checks over exact generated answer matching.

## Validation Focus

Test:

- metadata extraction
- chunk readability, overlap, and minimum-size behavior
- hashing and unchanged detection helpers
- prompt construction
- workspace-index scoped retrieval helpers where practical
- insufficient-context behavior
- docs-vault retrieval fixture coverage
