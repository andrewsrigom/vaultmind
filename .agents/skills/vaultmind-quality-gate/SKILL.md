---
name: vaultmind-quality-gate
description: Use when deciding which validation commands to run before finishing VaultMind changes.
---

# VaultMind Quality Gate

Use the smallest command set that proves the touched behavior works, then report what ran.

## Command Selection

- Docs or agent-instruction changes: inspect the touched Markdown and run `pnpm lint` when practical.
- In Codex Desktop on Windows, prefer `wsl -e bash -lc 'cd /path/to/vaultmind && pnpm <command>'` when UNC paths or Windows command shims break project commands.
- Dictionary, prompt, validator, and config object edits: expect `perfectionist/sort-objects`; run `pnpm lint` before finalizing and keep key order exactly as reported by ESLint.
- Public repository metadata changes: keep README, LICENSE, CONTRIBUTING.md,
  SECURITY.md, case study, architecture guide, RAG guide, glossary, and i18n
  decision aligned when relevant.
- Pure utility changes: run focused Vitest tests, then `pnpm lint` and `pnpm typecheck`.
- API route changes: run focused route/unit tests, then `pnpm lint`, `pnpm typecheck`, and `pnpm test:run`.
- DB schema or migration changes: run `pnpm db:generate` or `pnpm db:migrate` as appropriate, then `pnpm typecheck`.
- API contract or error-shape changes: verify responses use `{ ok: false, error: { code, message } }`.
- RAG behavior changes: run focused unit tests and `DATABASE_URL="postgresql://vaultmind:vaultmind@localhost:5433/vaultmind" pnpm test:run` when local Postgres is available; update `src/lib/rag/docs-vault-evaluation.test.ts` expectations when retrieval behavior changes.
- Sync behavior changes: verify idempotent unchanged sync and sync-already-running behavior with database-backed tests.
- UI changes: run focused component/page tests when present, then `pnpm lint` and `pnpm typecheck`; use a browser check for meaningful layout changes.
- Broad or cross-cutting changes: run `pnpm quality`.
- Build-including gates use an explicit HTTPS `VAULTMIND_BASE_URL`; use a
  reserved `.invalid` origin only for local or CI boot rehearsal.
- Release gate: run `pnpm quality:db`, `pnpm e2e`, and the strongest
  available smoke bundle: `pnpm smoke:core` when GitHub and Notion smoke
  credentials are available, otherwise `pnpm smoke:local`.
- Validation findings: fix obvious low-risk issues in the same pass; document
  larger follow-ups in README, the case study, or the roadmap.
- Dirty-worktree baselines: do not fix unrelated user changes just to make a broad command pass. Run focused checks for the touched behavior, run `git diff --check`, and report unrelated failures with exact files and lines.
- Long-running validation: when it is safe, keep independent documentation, review, or cleanup work moving while the command runs.

## Reporting

Report:

- areas changed
- validation commands run
- commands not run and why
- newly documented findings or follow-ups
- remaining risk or blocker, if any
