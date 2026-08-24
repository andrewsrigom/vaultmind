const localDevelopmentUrl = 'http://localhost:3000';
const loopbackHostnames = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

export class AppBaseUrlConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppBaseUrlConfigurationError';
  }
}

function trimEnv(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  return loopbackHostnames.has(normalizedHostname) || normalizedHostname.endsWith('.localhost');
}

export function canonicalizeHttpOrigin(value: string | null | undefined): string | null {
  const trimmed = trimEnv(value);

  if (!trimmed) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmed);

    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.origin === 'null' ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.pathname !== '/' ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      return null;
    }

    return parsedUrl.origin;
  } catch {
    return null;
  }
}

export function resolveAppBaseUrl(input: NodeJS.ProcessEnv = process.env): string {
  const configuredBaseUrl = trimEnv(input.VAULTMIND_BASE_URL);
  const origin = canonicalizeHttpOrigin(configuredBaseUrl);

  if (input.NODE_ENV !== 'production') {
    return origin ?? localDevelopmentUrl;
  }

  if (!origin) {
    throw new AppBaseUrlConfigurationError(
      'VAULTMIND_BASE_URL must be a valid HTTPS origin in production.',
    );
  }

  const parsedOrigin = new URL(origin);

  if (parsedOrigin.protocol !== 'https:' || isLoopbackHostname(parsedOrigin.hostname)) {
    throw new AppBaseUrlConfigurationError(
      'VAULTMIND_BASE_URL must use HTTPS and a non-loopback host in production.',
    );
  }

  return origin;
}
