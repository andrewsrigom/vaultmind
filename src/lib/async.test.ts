import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapWithConcurrency, withAbortTimeout } from '@/lib/async';

describe('mapWithConcurrency', () => {
  it('limits active work and preserves input order', async () => {
    let activeTasks = 0;
    let maxActiveTasks = 0;

    const results = await mapWithConcurrency({
      concurrency: 2,
      items: [1, 2, 3, 4],
      mapper: async (item) => {
        activeTasks += 1;
        maxActiveTasks = Math.max(maxActiveTasks, activeTasks);

        await new Promise((resolve) => {
          setTimeout(resolve, item === 1 ? 20 : 1);
        });

        activeTasks -= 1;

        return item * 10;
      },
    });

    expect(maxActiveTasks).toBe(2);
    expect(results).toEqual([10, 20, 30, 40]);
  });

  it('handles empty input', async () => {
    await expect(
      mapWithConcurrency({
        concurrency: 2,
        items: [],
        mapper: async (item: number) => item,
      }),
    ).resolves.toEqual([]);
  });
});

describe('withAbortTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts the operation after the configured timeout', async () => {
    vi.useFakeTimers();

    const result = withAbortTimeout(
      (signal) =>
        new Promise<boolean>((resolve) => {
          signal.addEventListener('abort', () => {
            resolve(signal.aborted);
          });
        }),
      100,
    );

    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBe(true);
  });
});
