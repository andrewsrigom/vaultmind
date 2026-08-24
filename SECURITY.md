# Security Policy

VaultMind can store private documents, embeddings, citations, model output, and connector credentials. Treat its database and backups as sensitive.

## Supported scope

The current `main` branch receives best-effort security fixes. There is no stable release support window yet.

The built-in access password protects the whole instance. It does not create separate identities or permission boundaries, so keep each instance inside one trust boundary.

The optional access password blocks the web interface with a signed HTTP-only cookie. It is useful on a trusted network, but it does not:

- encrypt the PostgreSQL database;
- replace full-disk encryption;
- protect a host that is already compromised;
- provide user-specific permissions;
- configure TLS or a network firewall.

Do not expose the development server or Compose database directly to the public internet.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/andrewsrigom/vaultmind/security/advisories/new). If private reporting is unavailable, open a public issue asking for a private contact channel and include no technical details.

A useful report contains the affected commit, prerequisites, impact, a synthetic reproduction, and a possible mitigation. Never include live credentials or private documents.

## Secrets

These values are server-only and must never use a `NEXT_PUBLIC_` prefix:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `SOURCE_CREDENTIAL_ENCRYPTION_KEY`
- `VAULTMIND_ACCESS_PASSWORD_HASH`
- GitHub, Notion, and Google Drive tokens or OAuth secrets

Keep `SOURCE_CREDENTIAL_ENCRYPTION_KEY` stable and back it up separately. Losing it makes stored OAuth credentials unreadable. Rotating it requires re-encrypting the stored credentials.

## Private content

VaultMind reads source text; it does not execute Markdown. Imported content is still untrusted:

- do not render raw HTML without sanitization;
- validate user-controlled URLs before server-side requests;
- keep provider calls on fixed or validated destinations;
- bound document sizes and network timeouts;
- do not log documents, prompts, embeddings, credentials, or raw provider responses;
- use least-privilege, read-only provider access.

The application stores full source text, chunks, chat history, retrieved excerpts, answers, and citations in PostgreSQL. Removing a source must also remove its locally indexed content and credentials. Database backups retain data until they are deleted separately.

## Remote deployment checklist

Before making an instance reachable outside a trusted machine:

- terminate TLS at a maintained reverse proxy;
- enable the VaultMind access password or stronger external access control;
- restrict PostgreSQL to a private network;
- store secrets outside the image and repository;
- configure encrypted backups and test restoration;
- define retention and deletion procedures;
- monitor application and database failures without logging content;
- apply dependency and base-image security updates.

Only synthetic or intentionally public data belongs in tests, demo fixtures, screenshots, and bug reports.
