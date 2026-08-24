# RAG pipeline

Every VaultMind source enters the same ingestion and retrieval path. Connector code handles provider APIs; the RAG layer handles documents, vectors, evidence, and answers.

## 1. Normalize

A source adapter returns `SourceDocument` records with a stable external ID, title, path, content hash, content, and source metadata.

Supported inputs are:

- GitHub Markdown and MDX;
- Notion pages and databases selected during OAuth;
- Google Drive files selected during OAuth;
- published documents created inside VaultMind.

## 2. Validate and chunk

Inputs are bounded before embedding. Markdown metadata is extracted, headings are preserved where useful, and each chunk carries enough path and heading context to stand on its own.

The content hash makes sync idempotent. Unchanged documents keep their existing chunks and embeddings.

## 3. Embed and persist

The default embedding model is `text-embedding-3-small`. Vectors are stored as 1,536-dimensional pgvector values.

Documents and chunks keep their workspace, source, and source-document identity. Connector credentials never enter document metadata.

## 4. Retrieve

Retrieval first applies structural scope:

- the selected workspace or set of workspaces;
- selected spaces when the question is narrowed;
- source and document state;
- the active vault.

Vector similarity produces candidates inside that boundary. Ranking helpers may favor useful document signals, but cannot expand the allowed scope.

## 5. Build the prompt

The prompt contains bounded excerpts with stable citation numbers. It asks the model to answer from the supplied evidence, state when evidence is insufficient, and use the active interface language.

The model does not choose which vault, workspace, or source it can search.

## 6. Save the result

Chat persistence includes:

- the user message;
- the answer or refusal;
- one row for each retrieved source;
- citation order, path, snippet, source identity, and similarity metadata.

This lets the UI reopen a conversation and show the evidence used at answer time.

## 7. Refuse weak evidence

No useful chunks, an empty scope, a security-sensitive request, or an unsupported model answer can produce a refusal. Citation rows are never fabricated to make a response appear sourced.

## Evaluation

Unit tests cover metadata extraction, chunking, ranking, prompt construction, citation rendering, and provider errors.

Database-backed tests cover ingestion, idempotent sync, vector retrieval, multi-source answers, citation persistence, workspace documents, and sync leases. Demo and test fixtures use deterministic providers so local validation does not depend on model output.
