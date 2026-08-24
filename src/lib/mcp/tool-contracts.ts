export const mcpToolContracts = {
  searchIndexedContext: {
    description:
      'Search indexed VaultMind context and return bounded source snippets with document metadata.',
    name: 'search_indexed_context',
    readOnlyHint: true,
    role: 'primary',
    title: 'Search Indexed Context',
  },
} as const;

export const mcpPrimaryToolNames = [mcpToolContracts.searchIndexedContext.name] as const;
export const mcpToolNames = [...mcpPrimaryToolNames] as const;
