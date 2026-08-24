# Case study: making RAG answers inspectable

## The problem

Useful knowledge rarely lives in one place. Setup instructions may be in a repository, decisions in Notion, and operating checklists in Google Drive. A chat interface can hide that fragmentation, but a plausible answer without a traceable source is hard to review.

VaultMind was built around a narrower question:

> Can one local index answer across different sources and preserve enough evidence for someone to check the result?

## Product shape

The application now concentrates on that loop:

1. connect or create a document source;
2. normalize and index its content;
3. ask within a known scope;
4. save the answer and the retrieved excerpts;
5. reopen the conversation and inspect its citations.

GitHub, Notion, Google Drive, and VaultMind documents all use the same retrieval path. Spaces organize the material without changing the underlying source contract.

## Engineering choices

### One normalized source contract

Each connector returns `SourceDocument[]`. Provider pagination, credential handling, and response quirks stay in the adapter. Chunking and retrieval do not need to know which API produced the text.

### Scope before similarity

Workspace, space, source, and document filters are applied before vector ranking. Prompt instructions are not treated as authorization.

### Citations are persisted

An answer stores the retrieved chunk IDs and their source metadata. The UI does not reconstruct evidence later from model prose. That makes saved history useful even after the index changes.

### Refusal is part of the result model

When retrieval cannot support an answer, VaultMind saves a refusal rather than inventing a citation. Security-sensitive prompt injection requests are rejected before a provider call.

### Connectors do not own ingestion

Adapters load documents; the shared pipeline validates, chunks, embeds, and writes them. This keeps idempotency and deletion behavior consistent across providers.

### The demo is deterministic

`pnpm demo:seed` creates synthetic GitHub, Notion, and Google Drive documents, deterministic embeddings, and a saved cited answer. It exercises the product path without requiring external credentials or spending model tokens.

## Schema footprint

The schema starts from one initial migration with 18 tables. Each table supports visible product behavior or an operational concern such as source credentials, sync leases, citation history, and area discovery.

## Validation

The repository uses strict TypeScript, route tests, source-adapter tests, database-backed RAG tests, Playwright flows, and local smoke scripts.

```bash
pnpm quality
pnpm quality:db
pnpm e2e
pnpm smoke:local
```

Real connector smoke tests are separate because they need provider credentials and intentionally configured sources.

## Current limits

- OpenAI is the only model provider implementation.
- Embedding storage is fixed at 1,536 dimensions.
- The included Compose setup is for local development.
- The access password protects the interface, not the database.
- Notion and Google Drive require OAuth configuration.
- Reindexing after an embedding-model change is still manual.

These limits are documented rather than hidden behind unfinished abstractions.
