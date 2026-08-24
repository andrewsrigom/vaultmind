import { describe, expect, it } from 'vitest';

import { mcpPrimaryToolNames, mcpToolContracts, mcpToolNames } from '@/lib/mcp/tool-contracts';

describe('MCP tool contracts', () => {
  it('keeps stable public tool names for local agent clients', () => {
    expect(mcpToolContracts.searchIndexedContext.name).toBe('search_indexed_context');
    expect(new Set(mcpToolNames).size).toBe(mcpToolNames.length);
    expect(mcpToolNames.every((toolName) => toolName.length > 0)).toBe(true);
  });

  it('keeps indexed search as the primary MCP capability', () => {
    expect(mcpPrimaryToolNames).toEqual(['search_indexed_context']);
    expect(mcpToolContracts.searchIndexedContext.role).toBe('primary');
    expect(mcpToolContracts.searchIndexedContext.description).toContain('bounded source snippets');
  });

  it('keeps all exposed MCP tools read-only', () => {
    expect(Object.values(mcpToolContracts).every((tool) => tool.readOnlyHint)).toBe(true);
  });
});
