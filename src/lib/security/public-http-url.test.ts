import { describe, expect, it, vi } from 'vitest';

import {
  isPublicIpAddress,
  parsePublicHttpsUrl,
  PublicHttpUrlError,
  requestPublicHttps,
} from '@/lib/security/public-http-url';

import type { PublicHostnameResolver } from '@/lib/security/public-http-url';

const resolvePublicHostname: PublicHostnameResolver = async () => [
  {
    address: '8.8.8.8',
    family: 4,
  },
];

describe('public HTTP URL security', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.0.1',
    '198.18.0.1',
    '203.0.113.10',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::c0a8:101',
    '64:ff9b::a9fe:a9fe',
    'fc00::1',
    'fe80::1',
    'ff02::1',
  ])('classifies %s as non-public', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('classifies %s as public', (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it.each([
    'http://hooks.contoso.com/path',
    'https://user:secret@hooks.contoso.com/path',
    'https://hooks.contoso.com:8443/path',
    'https://hooks.contoso.com/path#fragment',
    'https://localhost/path',
    'https://service.localhost/path',
    'https://metadata.google.internal/path',
    'https://127.0.0.1/path',
    'https://2130706433/path',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/path',
    'https://[fe80::1]/path',
  ])('rejects unsafe URL %s before network access', (url) => {
    expect(() => parsePublicHttpsUrl(url)).toThrow(PublicHttpUrlError);
  });

  it('rejects provider lookalikes without suffix confusion', () => {
    expect(() =>
      parsePublicHttpsUrl('https://logic.azure.com.attacker.com/workflow', {
        lookalikeHostnameSuffixes: ['logic.azure.com'],
      }),
    ).toThrow(PublicHttpUrlError);
  });

  it('rejects hostnames that resolve to private or mixed addresses', async () => {
    const fetchFn = vi.fn();
    const resolvePrivateHostname: PublicHostnameResolver = async () => [
      {
        address: '192.168.1.20',
        family: 4,
      },
    ];
    const resolveMixedHostname: PublicHostnameResolver = async () => [
      {
        address: '8.8.8.8',
        family: 4,
      },
      {
        address: '169.254.169.254',
        family: 4,
      },
    ];

    await expect(
      requestPublicHttps({
        fetchFn,
        resolveHostname: resolvePrivateHostname,
        url: 'https://hooks.contoso.com/path',
      }),
    ).rejects.toMatchObject({
      code: 'non-public-destination',
    });
    await expect(
      requestPublicHttps({
        fetchFn,
        resolveHostname: resolveMixedHostname,
        url: 'https://hooks.contoso.com/path',
      }),
    ).rejects.toMatchObject({
      code: 'non-public-destination',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses manual redirect handling after validating public DNS', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 202 }));

    await expect(
      requestPublicHttps({
        fetchFn,
        init: {
          method: 'POST',
        },
        resolveHostname: resolvePublicHostname,
        url: 'https://hooks.contoso.com/path',
      }),
    ).resolves.toMatchObject({
      status: 202,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://hooks.contoso.com/path',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
      }),
    );
  });
});
