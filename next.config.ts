import type { NextConfig } from 'next';

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export function getVaultMindSecurityHeaders(nodeEnv = process.env.NODE_ENV) {
  const headers = [
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'X-Frame-Options',
      value: 'DENY',
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=()',
    },
  ];

  if (nodeEnv === 'production') {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  }

  return headers;
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        headers: getVaultMindSecurityHeaders(),
        source: '/:path*',
      },
    ];
  },
  turbopack: {
    root: projectRoot,
  },
  typedRoutes: true,
};

export default nextConfig;
