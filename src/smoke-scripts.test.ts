import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

type PackageJson = {
  scripts: Record<string, string>;
};

const requiredLocalSmokeScripts = [
  'smoke:rag-demo',
  'smoke:workspace-doc-ask-ai',
  'smoke:mcp-local',
  'smoke:mcp-stdio',
] as const;

async function readPackageJson(): Promise<PackageJson> {
  const packageJsonPath = path.join(process.cwd(), 'package.json');

  return JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageJson;
}

async function readSmokeScript(fileName: string): Promise<string> {
  return readFile(path.join(process.cwd(), 'scripts', fileName), 'utf8');
}

describe('personal smoke script baseline', () => {
  it('keeps the local smoke bundle aligned with the multi-source RAG loop', async () => {
    const packageJson = await readPackageJson();
    const localSmokeScript = packageJson.scripts['smoke:local'];

    expect(localSmokeScript).toBeTruthy();

    for (const smokeScript of requiredLocalSmokeScripts) {
      expect(packageJson.scripts[smokeScript], `${smokeScript} must exist`).toBeTruthy();
      expect(localSmokeScript, `smoke:local must include ${smokeScript}`).toContain(
        `pnpm ${smokeScript}`,
      );
    }
  });

  it('keeps real connector checks layered on top of local smoke', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.scripts['smoke:core']).toContain('pnpm smoke:github-baseline');
    expect(packageJson.scripts['smoke:core']).toContain('pnpm smoke:notion-connected');
    expect(packageJson.scripts['smoke:core']).toContain('pnpm smoke:local');
  });

  it('keeps local MCP helper scripts discoverable', async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.scripts['mcp:stdio']).toBe('tsx scripts/vaultmind-mcp.ts');
    expect(packageJson.scripts['mcp:tools']).toBe('tsx scripts/print-mcp-tools.ts');
  });

  it('keeps connected-source smoke output structural and sanitized', async () => {
    const notionSmoke = await readSmokeScript('smoke-notion-connected.ts');
    const githubSmoke = await readSmokeScript('smoke-github-baseline.ts');

    for (const forbiddenOutput of [
      'answer: answer.answer',
      'repeatSyncSummary:',
      'sourceCount:',
      'syncSummary:',
    ]) {
      expect(notionSmoke).not.toContain(forbiddenOutput);
      expect(githubSmoke).not.toContain(forbiddenOutput);
    }

    expect(notionSmoke).toContain("createLogger('smoke-notion-connected')");
    expect(githubSmoke).toContain("createLogger('smoke-github-baseline')");
  });
});
