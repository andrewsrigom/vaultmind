type AbortTimeout = {
  clear: () => void;
  signal: AbortSignal;
};

function normalizeConcurrencyLimit(concurrency: number): number {
  if (!Number.isFinite(concurrency)) {
    return 1;
  }

  return Math.max(1, Math.floor(concurrency));
}

export async function mapWithConcurrency<TInput, TOutput>({
  concurrency,
  items,
  mapper,
}: {
  concurrency: number;
  items: readonly TInput[];
  mapper: (item: TInput, index: number) => Promise<TOutput>;
}): Promise<TOutput[]> {
  const results = new Array<TOutput>(items.length);
  const indexedItems = items.map((item, index) => ({ index, item }));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < indexedItems.length) {
      const currentIndex = nextIndex;
      const indexedItem = indexedItems[currentIndex];

      nextIndex += 1;

      if (!indexedItem) {
        continue;
      }

      results[indexedItem.index] = await mapper(indexedItem.item, indexedItem.index);
    }
  }

  const workerCount = Math.min(normalizeConcurrencyLimit(concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await worker();
    }),
  );

  return results;
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function createAbortTimeout(timeoutMs: number): AbortTimeout {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    clear: () => {
      clearTimeout(timeout);
    },
    signal: controller.signal,
  };
}

export async function withAbortTimeout<TValue>(
  operation: (signal: AbortSignal) => Promise<TValue>,
  timeoutMs: number,
): Promise<TValue> {
  const abortTimeout = createAbortTimeout(timeoutMs);

  try {
    return await operation(abortTimeout.signal);
  } finally {
    abortTimeout.clear();
  }
}
