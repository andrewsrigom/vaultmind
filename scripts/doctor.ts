import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

type CheckResult = {
  details: string;
  name: string;
  ok: boolean;
  remedy: string;
};

type CommandResult = {
  output: string;
  status: number | null;
};

const defaultDatabaseUrl = 'postgresql://vaultmind:vaultmind@localhost:5433/vaultmind';
const requiredEnvKeys = ['DATABASE_URL', 'OPENAI_API_KEY'] as const;

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function normalizeCommandOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output.trim();
  }

  if (Buffer.isBuffer(output)) {
    return output.toString('utf8').trim();
  }

  return '';
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
    timeout: 15_000,
  });
  const stderr = normalizeCommandOutput(result.stderr);
  const stdout = normalizeCommandOutput(result.stdout);

  return {
    output: stdout || stderr || result.error?.message || '',
    status: result.status ?? null,
  };
}

function createResult(name: string, ok: boolean, details = '', remedy = ''): CheckResult {
  return {
    details,
    name,
    ok,
    remedy,
  };
}

function getMajor(version: string): number | null {
  const match = /^v?(\d+)/u.exec(version.trim());

  if (!match?.[1]) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function readLocalEnv(): Record<string, string> {
  if (!existsSync('.env')) {
    return {};
  }

  const env: Record<string, string> = {};
  const envFile = readFileSync('.env', 'utf8');

  for (const line of envFile.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmedLine);

    if (!match?.[1] || match[2] === undefined) {
      continue;
    }

    env[match[1]] = match[2].replace(/^["']|["']$/gu, '');
  }

  return env;
}

function getEnvValue(localEnv: Record<string, string>, key: string): string | undefined {
  return process.env[key] ?? localEnv[key];
}

function getDatabaseUrl(localEnv: Record<string, string>): string {
  return getEnvValue(localEnv, 'DATABASE_URL') ?? defaultDatabaseUrl;
}

function createPostgresEnv(databaseUrl: string): NodeJS.ProcessEnv | null {
  try {
    const url = new URL(databaseUrl);
    const databaseName = url.pathname.replace(/^\//u, '');

    if (!databaseName || !url.hostname || !url.username) {
      return null;
    }

    const env = { ...process.env };
    env.PGDATABASE = decodeURIComponent(databaseName);
    env.PGHOST = url.hostname;
    env.PGPASSWORD = decodeURIComponent(url.password);
    env.PGPORT = url.port || '5432';
    env.PGUSER = decodeURIComponent(url.username);

    return env;
  } catch {
    return null;
  }
}

function checkNode(): CheckResult {
  const version = process.versions.node;

  return createResult(
    'Node.js',
    getMajor(version) === 24,
    `found ${version}`,
    'Install Node 24 or run `nvm use`.',
  );
}

function checkPnpm(): CheckResult {
  const result = runCommand('pnpm', ['--version']);
  const version = result.output;

  return createResult(
    'pnpm',
    result.status === 0 && getMajor(version) === 10,
    version ? `found ${version}` : 'not found',
    'Install pnpm 10.',
  );
}

function checkCommand(name: string, command: string, args: string[], remedy: string): CheckResult {
  const result = runCommand(command, args);

  return createResult(name, result.status === 0, result.output || 'not found', remedy);
}

function checkEnvFile(localEnv: Record<string, string>): CheckResult {
  const missingKeys = requiredEnvKeys.filter((key) => !getEnvValue(localEnv, key));
  const hasEnvFile = existsSync('.env');

  if (!hasEnvFile && missingKeys.length > 0) {
    return createResult(
      '.env',
      false,
      `missing .env and ${missingKeys.join(', ')}`,
      'Copy `.env.example` to `.env` or provide the required keys in the process environment.',
    );
  }

  return createResult(
    '.env',
    missingKeys.length === 0,
    missingKeys.length === 0
      ? hasEnvFile
        ? 'required keys present'
        : 'required keys present in process environment'
      : `missing ${missingKeys.join(', ')}`,
    'Fill DATABASE_URL and OPENAI_API_KEY.',
  );
}

function checkDatabase(localEnv: Record<string, string>): CheckResult {
  const postgresEnv = createPostgresEnv(getDatabaseUrl(localEnv));

  if (!postgresEnv) {
    return createResult(
      'PostgreSQL connection',
      false,
      'invalid DATABASE_URL',
      'Fix DATABASE_URL.',
    );
  }

  const result = runCommand('psql', ['-v', 'ON_ERROR_STOP=1', '-Atc', 'select 1'], postgresEnv);

  return createResult(
    'PostgreSQL connection',
    result.status === 0 && result.output === '1',
    result.status === 0 ? 'reachable' : result.output,
    'Run `pnpm db:up` and check DATABASE_URL.',
  );
}

function checkDatabaseSchema(localEnv: Record<string, string>): CheckResult {
  const postgresEnv = createPostgresEnv(getDatabaseUrl(localEnv));

  if (!postgresEnv) {
    return createResult('Database schema', false, 'invalid DATABASE_URL', 'Fix DATABASE_URL.');
  }

  const result = runCommand(
    'psql',
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      "select count(*) from information_schema.tables where table_schema = 'public'",
    ],
    postgresEnv,
  );
  const tableCount = Number.parseInt(result.output, 10);

  return createResult(
    'Database schema',
    result.status === 0 && tableCount > 0,
    Number.isFinite(tableCount) ? `${tableCount} public tables` : result.output,
    'Run `pnpm db:migrate`.',
  );
}

function checkPgvector(localEnv: Record<string, string>): CheckResult {
  const postgresEnv = createPostgresEnv(getDatabaseUrl(localEnv));

  if (!postgresEnv) {
    return createResult('pgvector', false, 'invalid DATABASE_URL', 'Fix DATABASE_URL.');
  }

  const result = runCommand(
    'psql',
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      "select extversion from pg_extension where extname = 'vector'",
    ],
    postgresEnv,
  );

  return createResult(
    'pgvector',
    result.status === 0 && result.output.length > 0,
    result.output ? `version ${result.output}` : 'extension missing',
    'Use `pnpm db:up`; the Docker image includes pgvector.',
  );
}

function checkPlaywrightCli(): CheckResult {
  const result = runCommand('pnpm', ['exec', 'playwright', '--version']);

  return createResult(
    'Playwright CLI',
    result.status === 0,
    result.output || 'not found',
    'Run `pnpm install`.',
  );
}

function checkPlaywrightChromium(): CheckResult {
  const result = runCommand('node', [
    '-e',
    "const { chromium } = require('@playwright/test'); const { existsSync } = require('node:fs'); const executablePath = chromium.executablePath(); process.stdout.write(executablePath); process.exit(existsSync(executablePath) ? 0 : 1);",
  ]);

  return createResult(
    'Playwright Chromium',
    result.status === 0,
    result.output || 'browser not installed',
    'Run `pnpm e2e:install`.',
  );
}

function main() {
  const localEnv = readLocalEnv();
  const checks = [
    checkNode(),
    checkPnpm(),
    checkCommand('Docker CLI', 'docker', ['--version'], 'Install Docker.'),
    checkCommand('Docker Compose', 'docker', ['compose', 'version'], 'Install Docker Compose.'),
    checkCommand('psql', 'psql', ['--version'], 'Install `postgresql-client`.'),
    checkEnvFile(localEnv),
    checkDatabase(localEnv),
    checkPgvector(localEnv),
    checkDatabaseSchema(localEnv),
    checkPlaywrightCli(),
    checkPlaywrightChromium(),
  ];
  const failedChecks = checks.filter((check) => !check.ok);

  for (const check of checks) {
    writeLine(`${check.ok ? 'OK  ' : 'FAIL'} ${check.name}: ${check.details}`);

    if (!check.ok && check.remedy) {
      writeLine(`     ${check.remedy}`);
    }
  }

  writeLine('');
  writeLine(
    failedChecks.length === 0
      ? 'Environment ready for local VaultMind work.'
      : `Environment has ${failedChecks.length} issue(s).`,
  );

  process.exit(failedChecks.length === 0 ? 0 : 1);
}

main();
