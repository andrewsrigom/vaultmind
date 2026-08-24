import { spawnSync } from 'node:child_process';

const defaultDatabaseUrl = 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pnpmArgs = process.argv.slice(2);

if (pnpmArgs.length === 0) {
  process.stderr.write('Provide a pnpm script to run with the local database.\n');
  process.exitCode = 1;
} else {
  const result = spawnSync(pnpmCommand, pnpmArgs, {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL?.trim() || defaultDatabaseUrl,
    },
    stdio: 'inherit',
  });

  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
  }

  process.exitCode = result.status ?? 1;
}
