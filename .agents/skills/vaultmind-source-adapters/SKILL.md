---
name: vaultmind-source-adapters
description: Use when adding, changing, or reviewing source adapters, GitHub sync, source config validation, or SourceDocument normalization.
---

# VaultMind Source Adapters

Source adapters turn external systems into `SourceDocument[]`. They must not know about chunking, embeddings, vector search, chat, or UI.

## Boundaries

- Keep adapter code under `src/lib/sources/`.
- Keep source config validation in `src/lib/validators/source.ts` or nearby named schemas.
- Return normalized `SourceDocument` values with stable `externalId`, `title`, `path`, `content`, `contentHash`, and metadata.
- Do not import RAG ingestion helpers into provider-specific file loading helpers.
- Keep provider-specific raw API response parsing inside `src/lib/sources/*`
  helpers; expose only normalized documents or selectable resource metadata to
  sync/RAG code.

## Current Source Scope

- GitHub is the proven source adapter baseline.
- Notion is the supported non-GitHub documentation connector.
- Google Drive is supported through its adapter and OAuth flow.
- Do not add placeholder providers or connection metadata for sources without a
  working adapter and focused tests.
- Published VaultMind documents enter RAG through a dedicated internal indexer;
  they are not external source adapters.

## GitHub Rules

- Support public and private GitHub.com repositories through required server-side `GITHUB_TOKEN`.
- Use a fine-grained PAT with read-only Contents access for baseline sync.
- Do not store `GITHUB_TOKEN` in source config or the database.
- Do not expose tokens to client components or API responses.
- Repository sync must use the GitHub API, not `git clone` or shell commands.
- Source config may store optional include/exclude path filters. Filters are
  repository-relative prefixes only; never store private tokens with them.

## Credential Rules

- OAuth tokens, API tokens, bot tokens, and SSH keys must live in encrypted
  source credentials, not in source config.
- Source config should store safe resource metadata: provider IDs, names,
  selected resources, branch/path filters, and non-secret URLs.
- Error responses must be safe and must not include provider response bodies,
  headers, private content, or credentials.

## Sync Limits

- Max 500 Markdown files per sync.
- Max 500 KB per Markdown file.
- Max 25 MB total Markdown content per sync.
- Fail before embedding generation if limits are exceeded.
- Only import `.md` and `.mdx` files.
- Apply include/exclude path filters before enforcing file count and size limits.
- Do not delete existing indexed documents if the latest source payload fails to load or violates limits.

## Sync Reliability

- Only one sync may run per source at a time.
- Double-clicking Sync latest must not create duplicate ingestion work.
- Re-running sync against unchanged content must be idempotent.
- Do not delete removed documents until the latest source payload has loaded and passed sync limits.

## Validation Focus

Test:

- GitHub URL parsing
- unsupported host rejection
- invalid branch/repo errors
- token missing or unauthorized errors
- Markdown filtering and sync limits
- include/exclude path filtering
- stable external IDs and content hashes
- sync already running behavior
- idempotent unchanged sync behavior
- safe error messages that do not expose provider response bodies, headers, or tokens

## Error Shape

API-facing adapter failures should map to:

```json
{
  "ok": false,
  "error": {
    "code": "machine-readable-code",
    "message": "Human readable message"
  }
}
```

Do not expose provider stack traces, tokens, raw headers, or private content in error responses.
