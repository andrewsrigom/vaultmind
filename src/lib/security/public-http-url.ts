import { lookup } from 'node:dns/promises';
import { request as requestHttps } from 'node:https';
import { BlockList, isIP } from 'node:net';

import type { LookupFunction } from 'node:net';

export type PublicHostnameAddress = {
  address: string;
  family: 4 | 6;
};

export type PublicHostnameResolver = (
  hostname: string,
) => Promise<readonly PublicHostnameAddress[]>;

export type PublicHttpsFetch = typeof fetch;

export type PublicHttpsUrlPolicy = {
  lookalikeHostnameSuffixes?: readonly string[] | undefined;
  maxLength?: number | undefined;
};

export type PublicHttpsRequestInit = {
  body?: string | undefined;
  headers?: HeadersInit | undefined;
  method?: 'GET' | 'POST' | undefined;
};

export class PublicHttpUrlError extends Error {
  code: 'dns-resolution-failed' | 'invalid-url' | 'non-public-destination' | 'url-policy-violation';

  constructor(code: PublicHttpUrlError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'PublicHttpUrlError';
  }
}

const defaultMaximumUrlLength = 8192;
const maximumResponseBytes = 5 * 1024 * 1024;
const requestTimeoutMs = 15_000;

const specialUseHostnameSuffixes = [
  'home',
  'internal',
  'invalid',
  'lan',
  'local',
  'localdomain',
  'localhost',
  'onion',
  'test',
] as const;

const blockedIpv4Subnets = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const;

const blockedIpv6Subnets = [
  ['::', 96],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const;

const blockedAddresses = new BlockList();

for (const [address, prefix] of blockedIpv4Subnets) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
  blockedAddresses.addSubnet('::ffff:' + address, 96 + prefix, 'ipv6');
}

for (const [address, prefix] of blockedIpv6Subnets) {
  blockedAddresses.addSubnet(address, prefix, 'ipv6');
}

const defaultResolveHostname: PublicHostnameResolver = async (hostname) => {
  const lookupAddresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });
  const addresses: PublicHostnameAddress[] = [];

  for (const lookupAddress of lookupAddresses) {
    if (lookupAddress.family === 4 || lookupAddress.family === 6) {
      addresses.push({
        address: lookupAddress.address,
        family: lookupAddress.family,
      });
    }
  }

  return addresses;
};

function normalizeHostname(hostname: string): string {
  const withoutIpv6Brackets =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  return withoutIpv6Brackets.replace(/\.+$/, '').toLowerCase();
}

function matchesHostnameSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith('.' + suffix);
}

function hasSpecialUseHostname(hostname: string): boolean {
  return specialUseHostnameSuffixes.some((suffix) => matchesHostnameSuffix(hostname, suffix));
}

function hasKnownHostnameLookalike(hostname: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffixValue) => {
    const suffix = normalizeHostname(suffixValue);

    return (
      suffix.length > 0 && hostname.includes(suffix) && !matchesHostnameSuffix(hostname, suffix)
    );
  });
}

export function isPublicIpAddress(address: string): boolean {
  const normalizedAddress = normalizeHostname(address);
  const family = isIP(normalizedAddress);

  if (family === 4) {
    return !blockedAddresses.check(normalizedAddress, 'ipv4');
  }

  if (family === 6) {
    return !blockedAddresses.check(normalizedAddress, 'ipv6');
  }

  return false;
}

export function parsePublicHttpsUrl(value: string | URL, policy: PublicHttpsUrlPolicy = {}): URL {
  const rawValue = value instanceof URL ? value.toString() : value.trim();
  const maximumLength = policy.maxLength ?? defaultMaximumUrlLength;

  if (rawValue.length === 0 || rawValue.length > maximumLength) {
    throw new PublicHttpUrlError('invalid-url', 'URL length is invalid.');
  }

  let url: URL;

  try {
    url = new URL(rawValue);
  } catch {
    throw new PublicHttpUrlError('invalid-url', 'URL is invalid.');
  }

  if (url.protocol !== 'https:') {
    throw new PublicHttpUrlError('url-policy-violation', 'URL must use HTTPS.');
  }

  if (url.username || url.password || url.hash) {
    throw new PublicHttpUrlError(
      'url-policy-violation',
      'URL credentials and fragments are not allowed.',
    );
  }

  if (url.port && url.port !== '443') {
    throw new PublicHttpUrlError('url-policy-violation', 'URL must use the default HTTPS port.');
  }

  const hostname = normalizeHostname(url.hostname);
  const addressFamily = isIP(hostname);

  if (!hostname || (addressFamily === 0 && !hostname.includes('.'))) {
    throw new PublicHttpUrlError(
      'non-public-destination',
      'URL hostname is not publicly routable.',
    );
  }

  if (hasSpecialUseHostname(hostname)) {
    throw new PublicHttpUrlError(
      'non-public-destination',
      'URL hostname is reserved for non-public use.',
    );
  }

  if (hasKnownHostnameLookalike(hostname, policy.lookalikeHostnameSuffixes ?? [])) {
    throw new PublicHttpUrlError(
      'url-policy-violation',
      'URL hostname resembles a provider domain without matching it.',
    );
  }

  if (addressFamily !== 0 && !isPublicIpAddress(hostname)) {
    throw new PublicHttpUrlError(
      'non-public-destination',
      'URL IP address is not publicly routable.',
    );
  }

  if (addressFamily === 0 && url.hostname !== hostname) {
    url.hostname = hostname;
  }

  return url;
}

async function resolvePublicAddresses(
  hostname: string,
  resolveHostname: PublicHostnameResolver,
): Promise<PublicHostnameAddress[]> {
  const addressFamily = isIP(hostname);

  if (addressFamily === 4 || addressFamily === 6) {
    return [
      {
        address: hostname,
        family: addressFamily,
      },
    ];
  }

  let resolvedAddresses: readonly PublicHostnameAddress[];

  try {
    resolvedAddresses = await resolveHostname(hostname);
  } catch {
    throw new PublicHttpUrlError('dns-resolution-failed', 'URL hostname could not be resolved.');
  }

  const addresses = new Map<string, PublicHostnameAddress>();

  for (const resolvedAddress of resolvedAddresses) {
    const normalizedAddress = normalizeHostname(resolvedAddress.address);
    const resolvedFamily = isIP(normalizedAddress);

    if (
      (resolvedFamily !== 4 && resolvedFamily !== 6) ||
      resolvedFamily !== resolvedAddress.family
    ) {
      throw new PublicHttpUrlError(
        'dns-resolution-failed',
        'URL hostname returned an invalid address.',
      );
    }

    if (!isPublicIpAddress(normalizedAddress)) {
      throw new PublicHttpUrlError(
        'non-public-destination',
        'URL hostname resolves to a non-public address.',
      );
    }

    addresses.set(normalizedAddress, {
      address: normalizedAddress,
      family: resolvedFamily,
    });
  }

  if (addresses.size === 0) {
    throw new PublicHttpUrlError(
      'dns-resolution-failed',
      'URL hostname did not resolve to an address.',
    );
  }

  return Array.from(addresses.values());
}

function createPinnedLookup(addresses: readonly PublicHostnameAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const requestedFamily = options.family === 4 || options.family === 6 ? options.family : null;
    const matchingAddresses = requestedFamily
      ? addresses.filter((address) => address.family === requestedFamily)
      : addresses;

    if (matchingAddresses.length === 0) {
      const error = new Error(
        'No validated address matches the requested network family.',
      ) as NodeJS.ErrnoException;

      error.code = 'ENOTFOUND';
      callback(error, '', 0);
      return;
    }

    if (options.all) {
      callback(
        null,
        matchingAddresses.map(({ address, family }) => ({ address, family })),
      );
      return;
    }

    const selectedAddress =
      matchingAddresses.find((address) => address.family === 4) ?? matchingAddresses[0];

    callback(null, selectedAddress?.address ?? '', selectedAddress?.family ?? 0);
  };
}

function createRequestHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const normalizedHeaders = new Headers(headers);
  const requestHeaders: Record<string, string> = {};

  normalizedHeaders.forEach((value, key) => {
    requestHeaders[key] = value;
  });

  return requestHeaders;
}

function createResponseHeaders(headers: Record<string, string | string[] | undefined>): Headers {
  const responseHeaders = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        responseHeaders.append(name, item);
      }
    } else if (value !== undefined) {
      responseHeaders.set(name, value);
    }
  }

  return responseHeaders;
}

async function requestWithPinnedAddresses(input: {
  addresses: readonly PublicHostnameAddress[];
  init?: PublicHttpsRequestInit | undefined;
  url: URL;
}): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const request = requestHttps(
      input.url,
      {
        headers: createRequestHeaders(input.init?.headers),
        lookup: createPinnedLookup(input.addresses),
        method: input.init?.method ?? 'GET',
      },
      (response) => {
        const chunks: Buffer[] = [];
        let responseBytes = 0;

        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

          responseBytes += buffer.byteLength;

          if (responseBytes > maximumResponseBytes) {
            response.destroy(new Error('Public HTTPS response exceeded the size limit.'));
            return;
          }

          chunks.push(buffer);
        });
        response.on('end', () => {
          const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : null;

          resolve(
            new Response(body, {
              headers: createResponseHeaders(response.headers),
              status: response.statusCode ?? 502,
              statusText: response.statusMessage ?? '',
            }),
          );
        });
        response.on('error', reject);
      },
    );

    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error('Public HTTPS request timed out.'));
    });
    request.on('error', reject);
    request.end(input.init?.body);
  });
}

/**
 * Validates every DNS answer and pins the HTTPS connection to those answers.
 * A provider policy without a complete official allowlist can prove only that
 * the destination is public; it cannot prove ownership by that provider.
 */
export async function requestPublicHttps(input: {
  fetchFn?: PublicHttpsFetch | undefined;
  init?: PublicHttpsRequestInit | undefined;
  policy?: PublicHttpsUrlPolicy | undefined;
  resolveHostname?: PublicHostnameResolver | undefined;
  url: string | URL;
}): Promise<Response> {
  const url = parsePublicHttpsUrl(input.url, input.policy);
  const hostname = normalizeHostname(url.hostname);
  const addresses = await resolvePublicAddresses(
    hostname,
    input.resolveHostname ?? defaultResolveHostname,
  );

  if (input.fetchFn) {
    // Injected transports are test seams. Production callers omit fetchFn so the
    // validated DNS answers are pinned by requestWithPinnedAddresses.
    const fetchInit: RequestInit = {
      redirect: 'manual',
      ...(input.init?.body !== undefined ? { body: input.init.body } : {}),
      ...(input.init?.headers !== undefined ? { headers: input.init.headers } : {}),
      ...(input.init?.method !== undefined ? { method: input.init.method } : {}),
    };

    return input.fetchFn(url.toString(), fetchInit);
  }

  return requestWithPinnedAddresses({
    addresses,
    ...(input.init ? { init: input.init } : {}),
    url,
  });
}
