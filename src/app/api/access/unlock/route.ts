import { z } from 'zod';

import {
  createLocalAccessSessionToken,
  getLocalAccessConfiguration,
  localAccessCookie,
  verifyLocalAccessPassword,
} from '@/lib/access/local-access';
import { parseJsonRequestBody } from '@/lib/api/request';
import { apiError, apiSuccess } from '@/lib/api/responses';

import type { NextRequest } from 'next/server';

const unlockRequestSchema = z.object({
  password: z.string().min(1).max(256),
});
const attemptWindowMilliseconds = 15 * 60 * 1000;
const maximumAttemptsPerWindow = 8;
const attemptsByClient = new Map<string, { count: number; resetAt: number }>();

function getClientKey(request: NextRequest): string {
  const forwardedAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  return forwardedAddress || request.headers.get('x-real-ip')?.trim() || 'local';
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin');

  return !origin || origin === request.nextUrl.origin;
}

function isRateLimited(clientKey: string, now = Date.now()): boolean {
  const attempt = attemptsByClient.get(clientKey);

  if (!attempt || attempt.resetAt <= now) {
    attemptsByClient.set(clientKey, {
      count: 0,
      resetAt: now + attemptWindowMilliseconds,
    });
    return false;
  }

  return attempt.count >= maximumAttemptsPerWindow;
}

function recordFailedAttempt(clientKey: string, now = Date.now()): void {
  const attempt = attemptsByClient.get(clientKey);

  if (!attempt || attempt.resetAt <= now) {
    attemptsByClient.set(clientKey, {
      count: 1,
      resetAt: now + attemptWindowMilliseconds,
    });
    return;
  }

  attempt.count += 1;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return apiError('forbidden', 'The unlock request origin is not allowed.', 403);
  }

  const clientKey = getClientKey(request);

  if (isRateLimited(clientKey)) {
    return apiError(
      'access-rate-limited',
      'Too many unlock attempts. Wait a few minutes and try again.',
      429,
    );
  }

  const parsedBody = await parseJsonRequestBody(request, unlockRequestSchema);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const configuration = getLocalAccessConfiguration();

  if (!configuration.enabled || !configuration.passwordHash) {
    return apiSuccess({ unlocked: true });
  }

  const passwordMatches = await verifyLocalAccessPassword(
    parsedBody.data.password,
    configuration.passwordHash,
  );

  if (!passwordMatches) {
    recordFailedAttempt(clientKey);
    return apiError('unauthorized', 'That password is not correct.', 401);
  }

  attemptsByClient.delete(clientKey);
  const response = apiSuccess({ unlocked: true });
  response.cookies.set({
    ...localAccessCookie,
    value: createLocalAccessSessionToken(configuration.passwordHash),
  });

  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return apiError('forbidden', 'The lock request origin is not allowed.', 403);
  }

  const response = apiSuccess({ locked: true });
  response.cookies.set({
    ...localAccessCookie,
    maxAge: 0,
    value: '',
  });

  return response;
}
