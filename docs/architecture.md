# Architecture

VaultMind is a Next.js application backed by PostgreSQL and pgvector. The browser, API routes, ingestion jobs, and local MCP process share the same schema and domain helpers.

## Main pieces

- **Application shell:** vaults, spaces, documents, source management, search, and Ask AI.
- **Source adapters:** GitHub, Notion, and Google Drive clients that return a common `SourceDocument` shape.
- **Ingestion pipeline:** validation, Markdown-aware chunking, embeddings, and idempotent persistence.
- **Retrieval pipeline:** structural scope, vector search, prompt construction, model calls, and saved citations.
- **Local MCP server:** read-only indexed search for one configured workspace.

## Data flow

```text
provider API or published VaultMind document
                    |
              SourceDocument[]
                    |
       validate -> chunk -> embed
                    |
       documents + chunks in PostgreSQL
                    |
          scoped pgvector search
                    |
            prompt + model call
                    |
          answer + saved citations
```

Adapters stop at normalization. They do not write chunks and do not know how retrieval works. The RAG pipeline does not contain provider-specific API calls.

## Storage model

The initial migration creates 18 tables grouped around:

- vaults, spaces, internal documents, and source connections;
- normalized documents, chunks, embeddings, and sync jobs;
- chat sessions, messages, retrieved citations, and knowledge events;
- saved articles and area-discovery suggestions;
- encrypted source credentials.

Provider credentials are stored separately from non-secret source configuration and encrypted before persistence.

## Retrieval boundaries

A vault can contain several indexed workspaces and spaces. A question may search one workspace, selected spaces, or all searchable workspaces in a vault. Structural filters are applied before vector ranking; prompt text never grants access to another source or scope.

The optional access password applies to the web interface through a signed cookie. PostgreSQL, the host, and the stdio MCP process remain separate security boundaries.

## API boundaries

API routes:

1. validate route parameters and JSON bodies;
2. check the local access lock;
3. resolve the selected vault, workspace, or space;
4. call a query or domain helper;
5. return a typed success or a safe error response.

External failures go through the project logger. Provider payloads, document content, prompts, and credentials are not written to logs.

## Failure behavior

- The application renders a database-unavailable state without exposing a stack trace.
- Chat returns `source-not-configured` when no searchable chunks exist.
- Weak or missing evidence produces a refusal instead of invented citations.
- Sync jobs use leases so an abandoned run can be recovered safely.
- Connector requests have timeouts and content-size limits.

## Deployment boundary

The Compose file is intended for local development. A remote installation still needs TLS, private database networking, managed secrets, backups, retention rules, and host monitoring. See [SECURITY.md](../SECURITY.md).
