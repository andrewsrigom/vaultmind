import { describe, expect, it } from 'vitest';

import { apiDatabaseError, apiError, apiSuccess, apiUnexpectedError } from '@/lib/api/responses';

describe('api responses', () => {
  it('sets no-store and nosniff headers on success responses', () => {
    const response = apiSuccess({ id: 'test' });

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets no-store and nosniff headers on error responses', () => {
    const response = apiError('invalid-input', 'Invalid input.', 400);

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('creates standardized database and unexpected error responses', async () => {
    const databaseResponse = apiDatabaseError('Could not load data.');
    const unexpectedResponse = apiUnexpectedError('Could not complete action.');

    await expect(databaseResponse.json()).resolves.toMatchObject({
      error: {
        code: 'database-error',
        message: 'Could not load data. Check the local PostgreSQL container and try again.',
      },
    });
    await expect(unexpectedResponse.json()).resolves.toMatchObject({
      error: {
        code: 'unexpected-error',
        message: 'Could not complete action. Check the local PostgreSQL container and try again.',
      },
    });
    expect(databaseResponse.status).toBe(500);
    expect(unexpectedResponse.status).toBe(500);
  });
});
