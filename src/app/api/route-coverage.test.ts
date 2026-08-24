import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

async function findFilesByName(directory: string, fileName: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findFilesByName(entryPath, fileName);
      }

      return entry.isFile() && entry.name === fileName ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat();
}

describe('API route coverage baseline', () => {
  it('keeps focused route tests beside every API route', async () => {
    const apiRoot = path.join(process.cwd(), 'src/app/api');
    const routes = await findFilesByName(apiRoot, 'route.ts');
    const routeTests = await findFilesByName(apiRoot, 'route.test.ts');
    const routeTestPaths = new Set(
      routeTests.map((routeTest) => path.relative(apiRoot, routeTest)),
    );
    const missingRouteTests = routes
      .map((route) => path.relative(apiRoot, route))
      .filter((route) => !routeTestPaths.has(route.replace(/route\.ts$/, 'route.test.ts')))
      .sort();

    expect(missingRouteTests, `Missing API route tests:\n${missingRouteTests.join('\n')}`).toEqual(
      [],
    );
  });
});
