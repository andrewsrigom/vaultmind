# VaultMind Agent Guide

## Purpose

VaultMind is a self-hosted multi-source RAG application for indexed documents, cited answers, local knowledge organization, and read-only MCP search.

Keep the repository focused, runnable, honest about its security model, and safe to publish.

## Stack

- Next.js 16, React 19, Node.js 24, pnpm 10
- TypeScript strict mode with `@/` mapped to `./src/`
- Tailwind CSS and shadcn/ui conventions
- Drizzle ORM, PostgreSQL, pgvector, Docker Compose
- OpenAI for embeddings and answer generation
- GitHub, Notion, and Google Drive source adapters
- Zod, ESLint, Prettier, Vitest, and Playwright

## Commands

Use `pnpm`.

```bash
pnpm doctor
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test:run
pnpm quality
pnpm quality:db
pnpm e2e
pnpm smoke:local
pnpm smoke:core
pnpm demo:seed
pnpm db:up
pnpm db:down
pnpm db:generate
pnpm db:migrate
```

The default local database is `postgresql://vaultmind:vaultmind@localhost:5433/vaultmind`.

## Code rules

- Preserve behavior unless the task asks for a behavior change.
- Prefer existing helpers, schemas, and components.
- Keep source adapters separate from generic ingestion and retrieval.
- Keep model-provider implementations outside UI and page components.
- Validate API boundaries with named Zod schemas.
- Use explicit types at API, adapter, provider, and public function boundaries.
- Do not use `any` in `src`; catch external errors as `unknown` and narrow them.
- Use the project logger instead of `console.*` in application code.
- Use named exports except for framework-required entrypoints.
- Do not weaken TypeScript, lint, or test standards.
- Use Conventional Commits.

## Security

- Provider tokens, `OPENAI_API_KEY`, database credentials, and encryption keys are server-only.
- Never commit private source content, `.env`, database dumps, embeddings, or secret-bearing fixtures.
- The optional password protects the web interface, not PostgreSQL or the stdio MCP process.
- Repository sync uses provider APIs, not `git clone` or shell commands.
- Demo and public test data must be synthetic or intentionally public.

## Quality gates

- TypeScript or TSX: focused tests, then `pnpm lint`, `pnpm typecheck`, and `pnpm test:run`.
- Database, RAG, or sync: also run `pnpm quality:db` when PostgreSQL is available.
- Browser flows: run `pnpm e2e`.
- Broad changes: run `pnpm quality`, `pnpm quality:db`, `pnpm e2e`, and `pnpm smoke:local`.
- Setup, environment, Docker, and README changes must match actual commands and variables.

## Skill map

- Database schema: `.agents/skills/vaultmind-db-schema/SKILL.md`
- Quality gates: `.agents/skills/vaultmind-quality-gate/SKILL.md`
- RAG pipeline: `.agents/skills/vaultmind-rag-pipeline/SKILL.md`
- Source adapters: `.agents/skills/vaultmind-source-adapters/SKILL.md`
- UI: `.agents/skills/vaultmind-ui/SKILL.md`
