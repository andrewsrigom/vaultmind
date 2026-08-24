import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, SafeLogError } from '@/lib/logger';

function readLoggedPayload(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const output = spy.mock.calls.at(-1)?.[0];

  if (typeof output !== 'string') {
    throw new Error('Expected a JSON log line.');
  }

  return JSON.parse(output) as Record<string, unknown>;
}

function readErrorFingerprint(payload: Record<string, unknown>): string {
  const error = payload.error;

  if (
    !error ||
    typeof error !== 'object' ||
    !('fingerprint' in error) ||
    typeof error.fingerprint !== 'string'
  ) {
    throw new Error('Expected a serialized error fingerprint.');
  }

  return error.fingerprint;
}

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts SQL and parameters from Drizzle query errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('logger-test');
    const query = 'insert into workspace_docs (content) values ($1)';
    const privateContent = 'private document body and bearer-token-123';

    logger.error(
      'Database operation failed.',
      new DrizzleQueryError(query, [privateContent], new Error('database rejected the query')),
    );

    const payload = readLoggedPayload(consoleSpy);
    const serializedPayload = JSON.stringify(payload);

    expect(serializedPayload).not.toContain(query);
    expect(serializedPayload).not.toContain(privateContent);
    expect(serializedPayload).not.toContain('database rejected the query');
    expect(payload).toMatchObject({
      error: {
        fingerprint: expect.stringMatching(/^err-[0-9a-f]{8}$/u),
        message: 'Error details redacted.',
        name: 'DrizzleQueryError',
      },
    });
  });

  it('redacts external error messages and non-allowlisted context fields', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = createLogger('logger-test');
    const providerError = Object.assign(new Error('Provider response included sk-live-secret'), {
      code: 'provider_error',
      status: 502,
    });

    logger.warn('Provider operation failed.', {
      error: providerError,
      errorMessage: providerError.message,
      prompt: 'private model prompt',
      workspaceIndexId: 'workspace-safe-id',
    });

    const payload = readLoggedPayload(consoleSpy);
    const serializedPayload = JSON.stringify(payload);

    expect(serializedPayload).not.toContain('sk-live-secret');
    expect(serializedPayload).not.toContain('private model prompt');
    expect(payload).toMatchObject({
      context: {
        error: {
          code: 'provider_error',
          fingerprint: expect.stringMatching(/^err-[0-9a-f]{8}$/u),
          message: 'Error details redacted.',
          name: 'Error',
          status: 502,
        },
        redactedFieldCount: 2,
        workspaceIndexId: 'workspace-safe-id',
      },
    });
    expect(payload.context).not.toHaveProperty('errorMessage');
    expect(payload.context).not.toHaveProperty('prompt');
  });

  it('omits private titles and generic names from context', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = createLogger('logger-test');

    logger.warn('Source item skipped.', {
      fileId: 'drive-file-123',
      name: 'Confidential Customer Alpha',
      sourceName: 'Private Board Acquisition',
      title: 'Private Q4 roadmap',
      workspaceIndexId: 'workspace-safe-id',
    });

    const payload = readLoggedPayload(consoleSpy);
    const serializedPayload = JSON.stringify(payload);

    expect(serializedPayload).not.toContain('Confidential Customer Alpha');
    expect(serializedPayload).not.toContain('Private Board Acquisition');
    expect(serializedPayload).not.toContain('Private Q4 roadmap');
    expect(payload).toMatchObject({
      context: {
        fileId: 'drive-file-123',
        redactedFieldCount: 3,
        workspaceIndexId: 'workspace-safe-id',
      },
    });
    expect(payload.context).not.toHaveProperty('name');
    expect(payload.context).not.toHaveProperty('sourceName');
    expect(payload.context).not.toHaveProperty('title');
  });

  it('never throws for invalid dates in allowlisted context timestamps', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const logger = createLogger('logger-test');

    expect(() =>
      logger.info('Source sync completed.', {
        completedAt: new Date(Number.NaN),
        workspaceIndexId: 'workspace-safe-id',
      }),
    ).not.toThrow();
    expect(readLoggedPayload(consoleSpy)).toMatchObject({
      context: {
        completedAt: '[invalid-date]',
        workspaceIndexId: 'workspace-safe-id',
      },
    });
  });

  it('preserves safe operational error distinctions without external messages', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('logger-test');
    const timeoutError = Object.assign(new Error('private upstream endpoint timed out'), {
      code: 'ETIMEDOUT',
      status: 504,
    });
    const repeatedTimeoutError = Object.assign(new Error('different private endpoint detail'), {
      code: 'ETIMEDOUT',
      status: 504,
    });
    const refusedError = Object.assign(new Error('private database host refused connection'), {
      code: 'ECONNREFUSED',
      status: 503,
    });

    logger.error('Provider operation failed.', timeoutError);
    const timeoutPayload = readLoggedPayload(consoleSpy);
    logger.error('Provider operation failed.', repeatedTimeoutError);
    const repeatedTimeoutPayload = readLoggedPayload(consoleSpy);
    logger.error('Provider operation failed.', refusedError);
    const refusedPayload = readLoggedPayload(consoleSpy);

    expect(timeoutPayload).toMatchObject({
      error: {
        code: 'ETIMEDOUT',
        fingerprint: expect.stringMatching(/^err-[0-9a-f]{8}$/u),
        message: 'Error details redacted.',
        name: 'Error',
        status: 504,
      },
    });
    expect(refusedPayload).toMatchObject({
      error: {
        code: 'ECONNREFUSED',
        fingerprint: expect.stringMatching(/^err-[0-9a-f]{8}$/u),
        message: 'Error details redacted.',
        name: 'Error',
        status: 503,
      },
    });
    expect(JSON.stringify([timeoutPayload, repeatedTimeoutPayload, refusedPayload])).not.toContain(
      'private',
    );
    expect(readErrorFingerprint(timeoutPayload)).toBe(readErrorFingerprint(repeatedTimeoutPayload));
    expect(readErrorFingerprint(timeoutPayload)).not.toBe(readErrorFingerprint(refusedPayload));
  });

  it('preserves explicitly allowlisted internal error details', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('logger-test');

    logger.error(
      'Background operation failed.',
      new SafeLogError({
        code: 'background-run-failed',
        message: 'Could not complete this operation.',
        name: 'BackgroundRunError',
        status: 500,
      }),
    );

    expect(readLoggedPayload(consoleSpy)).toMatchObject({
      error: {
        code: 'background-run-failed',
        fingerprint: expect.stringMatching(/^err-[0-9a-f]{8}$/u),
        message: 'Could not complete this operation.',
        name: 'BackgroundRunError',
        status: 500,
      },
    });
  });
});
