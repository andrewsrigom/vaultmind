import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const buildRehearsalBaseUrl = 'https://vaultmind.invalid';
const randomSecretBytes = 48;

function getConfiguredValue(value: string | undefined): string | undefined {
  const configuredValue = value?.trim();

  return configuredValue ? configuredValue : undefined;
}

function createBuildRehearsalEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...input,
    SOURCE_CREDENTIAL_ENCRYPTION_KEY:
      getConfiguredValue(input.SOURCE_CREDENTIAL_ENCRYPTION_KEY) ??
      randomBytes(randomSecretBytes).toString('base64url'),
    VAULTMIND_BASE_URL: buildRehearsalBaseUrl,
  };
}

function runBuildRehearsal(): void {
  const packageManagerCli = getConfiguredValue(process.env.npm_execpath);

  if (!packageManagerCli) {
    throw new Error('The build rehearsal must be started through pnpm.');
  }

  const result = spawnSync(process.execPath, [packageManagerCli, 'build'], {
    env: createBuildRehearsalEnvironment(),
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

runBuildRehearsal();
