import { canonicalizeHttpOrigin, resolveAppBaseUrl } from '@/lib/security/app-url';

const unsafeInternalUrlCharacterPattern = /[\\\u0000-\u001f\u007f]/u;

export function parseCanonicalInternalUrl(
  value: null | string | undefined,
  canonicalOrigin = resolveAppBaseUrl(),
): URL | null {
  const normalizedValue = value?.trim();
  const normalizedOrigin = canonicalizeHttpOrigin(canonicalOrigin);

  if (
    !normalizedValue ||
    !normalizedOrigin ||
    !normalizedValue.startsWith('/') ||
    normalizedValue.startsWith('//') ||
    unsafeInternalUrlCharacterPattern.test(normalizedValue)
  ) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue, normalizedOrigin);

    return parsedUrl.origin === normalizedOrigin ? parsedUrl : null;
  } catch {
    return null;
  }
}

export function resolveCanonicalInternalPath(
  value: null | string | undefined,
  canonicalOrigin = resolveAppBaseUrl(),
): string | null {
  const parsedUrl = parseCanonicalInternalUrl(value, canonicalOrigin);

  return parsedUrl ? `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` : null;
}

export function buildCanonicalInternalUrl({
  canonicalOrigin = resolveAppBaseUrl(),
  fallbackPath,
  path,
}: {
  canonicalOrigin?: string | undefined;
  fallbackPath: string;
  path: string | undefined;
}): string {
  const normalizedOrigin = canonicalizeHttpOrigin(canonicalOrigin);
  const safePath = resolveCanonicalInternalPath(path, canonicalOrigin);
  const safeFallbackPath = resolveCanonicalInternalPath(fallbackPath, canonicalOrigin);

  if (!normalizedOrigin || !safeFallbackPath) {
    throw new Error('Canonical origin and fallback path must be valid internal URL values.');
  }

  return new URL(safePath ?? safeFallbackPath, normalizedOrigin).toString();
}
