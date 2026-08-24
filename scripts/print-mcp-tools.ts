import { mcpPrimaryToolNames, mcpToolContracts, mcpToolNames } from '@/lib/mcp/tool-contracts';

const manifest = {
  name: 'vaultmind-context-search',
  primaryTools: [...mcpPrimaryToolNames],
  tools: mcpToolNames.map((toolName) => {
    const contract = Object.values(mcpToolContracts).find((tool) => tool.name === toolName);

    if (!contract) {
      throw new Error(`Missing MCP tool contract for ${toolName}.`);
    }

    return {
      description: contract.description,
      name: contract.name,
      readOnlyHint: contract.readOnlyHint,
      role: contract.role,
      title: contract.title,
    };
  }),
  version: '0.1.0',
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
