import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const accessCookieName = 'vaultmind_access';
const accessHashPrefix = 'scrypt-v1';
const accessSessionVersion = 'v1';
const accessSessionLifetimeSeconds = 12 * 60 * 60;
const accessSessionPurpose = 'vaultmind-personal-access';
const derivedKeyLength = 64;

export const localAccessCookie = {
  httpOnly: true,
  maxAge: accessSessionLifetimeSeconds,
  name: accessCookieName,
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

type LocalAccessConfiguration = {
  enabled: boolean;
  passwordHash: string | null;
};

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, derivedKeyLength, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function parsePasswordHash(value: string): { digest: Buffer; salt: Buffer } | null {
  const [prefix, saltValue, digestValue, ...extraParts] = value.split('$');

  if (prefix !== accessHashPrefix || !saltValue || !digestValue || extraParts.length > 0) {
    return null;
  }

  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const digest = Buffer.from(digestValue, 'base64url');

    if (salt.length < 16 || digest.length !== derivedKeyLength) {
      return null;
    }

    return { digest, salt };
  } catch {
    return null;
  }
}

function getSessionSigningKey(passwordHash: string): Buffer {
  return createHmac('sha256', passwordHash).update(accessSessionPurpose).digest();
}

function signSessionExpiry(passwordHash: string, expiresAt: number): string {
  return createHmac('sha256', getSessionSigningKey(passwordHash))
    .update(`${accessSessionVersion}.${expiresAt}`)
    .digest('base64url');
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = pair.slice(0, separatorIndex).trim();

    if (cookieName !== name) {
      continue;
    }

    return pair.slice(separatorIndex + 1).trim() || null;
  }

  return null;
}

export function getLocalAccessConfiguration(
  input: Readonly<Record<string, string | undefined>> = process.env,
): LocalAccessConfiguration {
  const passwordHash = input.VAULTMIND_ACCESS_PASSWORD_HASH?.trim() || null;

  if (!passwordHash) {
    return { enabled: false, passwordHash: null };
  }

  if (!parsePasswordHash(passwordHash)) {
    throw new Error(
      'VAULTMIND_ACCESS_PASSWORD_HASH must be generated with `pnpm access:hash-password`.',
    );
  }

  return { enabled: true, passwordHash };
}

export function isLocalAccessEnabled(
  input: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return getLocalAccessConfiguration(input).enabled;
}

export async function hashLocalAccessPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('The access password must contain at least 12 characters.');
  }

  if (password.length > 256) {
    throw new Error('The access password must contain at most 256 characters.');
  }

  const salt = randomBytes(24);
  const digest = await scryptAsync(password, salt);

  return `${accessHashPrefix}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

export async function verifyLocalAccessPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!password || password.length > 256) {
    return false;
  }

  const parsedHash = parsePasswordHash(passwordHash);

  if (!parsedHash) {
    return false;
  }

  const actualDigest = await scryptAsync(password, parsedHash.salt);

  return timingSafeEqual(actualDigest, parsedHash.digest);
}

export function createLocalAccessSessionToken(passwordHash: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + accessSessionLifetimeSeconds;
  const signature = signSessionExpiry(passwordHash, expiresAt);

  return `${accessSessionVersion}.${expiresAt}.${signature}`;
}

export function verifyLocalAccessSessionToken(
  token: string | null | undefined,
  passwordHash: string,
  now = Date.now(),
): boolean {
  if (!token) {
    return false;
  }

  const [version, expiresAtValue, signatureValue, ...extraParts] = token.split('.');
  const expiresAt = Number(expiresAtValue);

  if (
    version !== accessSessionVersion ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000) ||
    !signatureValue ||
    extraParts.length > 0
  ) {
    return false;
  }

  const expectedSignature = signSessionExpiry(passwordHash, expiresAt);
  const actualSignature = Buffer.from(signatureValue);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  return (
    actualSignature.length === expectedSignatureBuffer.length &&
    timingSafeEqual(actualSignature, expectedSignatureBuffer)
  );
}

export function isLocalAccessGranted(cookieHeader: string | null): boolean {
  const configuration = getLocalAccessConfiguration();

  if (!configuration.enabled || !configuration.passwordHash) {
    return true;
  }

  return verifyLocalAccessSessionToken(
    readCookie(cookieHeader, accessCookieName),
    configuration.passwordHash,
  );
}
