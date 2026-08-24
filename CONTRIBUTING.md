# Contributing

VaultMind is a self-hosted knowledge project. Contributions should improve its core: source ingestion, retrieval, citations, local MCP search, documentation, or safe operation.

For a large feature or a public contract change, open an issue first. Small fixes, tests, and documentation corrections can go straight to a pull request.

## Local setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm run doctor
pnpm dev
```

Use synthetic or intentionally public documents while developing. Never commit an `.env` file, database dump, private source content, generated embeddings, or a screenshot with private data.

## Code boundaries

- Source adapters normalize external content into `SourceDocument[]`.
- RAG code stays independent of individual providers.
- Provider clients do not belong in page or UI components.
- Database access lives in focused query helpers.
- API inputs use named Zod schemas.
- Server secrets never enter client props, browser bundles, logs, fixtures, or docs.
- Do not use `any` in `src`; catch external errors as `unknown` and narrow them.
- Use named exports except where Next.js requires a default entrypoint.

Prefer an existing helper or pattern before adding another abstraction.

## Validation

Start with the smallest test that covers the change, then run:

```bash
pnpm lint
pnpm typecheck
pnpm test:run
```

Database, ingestion, retrieval, and browser changes should also be checked with the local PostgreSQL instance:

```bash
pnpm quality:db
pnpm e2e
pnpm smoke:local
```

Use `pnpm smoke:core` only when the GitHub and Notion smoke credentials are available.

## Commits

Use Conventional Commits:

```text
feat(sources): add a bounded document loader
fix(rag): keep citations inside the selected space
docs: clarify local data storage
```

## Pull requests

A pull request should state:

- what changed and why;
- which behavior is intentionally out of scope;
- which tests or quality gates were run;
- whether a database migration or reindex is required.

Check that logs and fixtures contain no tokens, private paths, provider payloads, or real document content.

By contributing, you agree that your contribution is licensed under the repository's [MIT license](LICENSE).

Security issues should follow [SECURITY.md](SECURITY.md), not a public issue.
