import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { resolveCanonicalInternalPath } from '@/lib/security/internal-url';

export type GitHubOAuthState = {
  createdAt: number;
  returnTo: string;
  sourceId: string;
  workspaceIndexId: string;
};

const stateMaxAgeMs = 15 * 60 * 1000;

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

function isState(value: unknown): value is GitHubOAuthState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const state = value as Record<string, unknown>;

  return (
    typeof state.createdAt === 'number' &&
    typeof state.returnTo === 'string' &&
    typeof state.sourceId === 'string' &&
    typeof state.workspaceIndexId === 'string'
  );
}

export function createGitHubOAuthState(input: {
  returnTo: string;
  secret: string;
  sourceId: string;
  workspaceIndexId: string;
}): string {
  const payload = toBase64Url(
    JSON.stringify({
      createdAt: Date.now(),
      returnTo: resolveCanonicalInternalPath(input.returnTo) ?? '/integrations',
      sourceId: input.sourceId,
      workspaceIndexId: input.workspaceIndexId,
    } satisfies GitHubOAuthState),
  );
  const signature = signPayload(payload, input.secret);

  return `${payload}.${signature}`;
}

export function parseGitHubOAuthState(input: {
  secret: string;
  state: string;
}): GitHubOAuthState | null {
  const [payload, signature] = input.state.split('.');

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload, input.secret);
  const expectedSignatureBytes = Buffer.from(expectedSignature, 'base64url');
  const signatureBytes = Buffer.from(signature, 'base64url');

  if (
    expectedSignatureBytes.length !== signatureBytes.length ||
    !timingSafeEqual(expectedSignatureBytes, signatureBytes)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as unknown;

    if (!isState(parsed)) {
      return null;
    }

    if (Date.now() - parsed.createdAt > stateMaxAgeMs) {
      return null;
    }

    const returnTo = resolveCanonicalInternalPath(parsed.returnTo);

    if (!returnTo) {
      return null;
    }

    return { ...parsed, returnTo };
  } catch {
    return null;
  }
}
