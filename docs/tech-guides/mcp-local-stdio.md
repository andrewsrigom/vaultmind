# Local MCP over stdio

VaultMind includes a read-only MCP server for local coding agents. It exposes one indexed space at a time.

## Configure

Start PostgreSQL, apply migrations, and sync at least one source. Copy the target workspace index ID into `.env`:

```dotenv
VAULTMIND_MCP_WORKSPACE_INDEX_ID="workspace-uuid"
```

The MCP process also needs `DATABASE_URL`, `OPENAI_API_KEY`, and the same environment used by the VaultMind instance.

## Inspect tools

```bash
pnpm mcp:tools
```

## Start the server

```bash
pnpm mcp:stdio
```

The process uses standard input and output for MCP transport. Diagnostic logs go to standard error so they do not corrupt protocol messages.

## Available behavior

The local tool provides bounded indexed search. It returns source metadata and short excerpts, not complete database rows or connector credentials.

## Security notes

- The configured workspace index ID is the MCP scope.
- Run the process only for a local client you trust.
- Keep the spawned process environment private.
- Do not paste MCP output from private sources into public issues or logs.
- Stop the process when it is no longer needed.

The web-interface access password does not authenticate a separate stdio process. Operating-system access to the MCP command and its environment is the security boundary.
