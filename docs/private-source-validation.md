# Validating private sources safely

Private-source checks should prove connector behavior without turning private content into project history.

## Before testing

- Use a dedicated read-only token with the smallest practical scope.
- Put credentials in local environment variables, never command arguments committed to scripts.
- Use a disposable or clearly named test source when possible.
- Confirm that `.env`, Playwright output, logs, and screenshots are ignored.

## What to verify

1. The connector can list only the resources the credential may access.
2. Selection limits the scope saved in VaultMind.
3. Sync creates normalized documents and bounded chunks.
4. A question retrieves the expected private source without logging its content.
5. Removing the connection deletes stored credentials and locally indexed documents.
6. A second sync is idempotent when the source has not changed.

Use structural assertions such as counts, source types, or synthetic marker IDs. Avoid exact private titles, repository names, paths, excerpts, and answers in test output.

## After testing

- Remove the connector from VaultMind.
- Delete the local database or verify the relevant rows were removed.
- Clear generated screenshots, traces, and logs.
- Revoke disposable credentials.
- Check `git status` and scan new files before committing.

Public CI and public demo scripts must use synthetic or intentionally public sources only.
