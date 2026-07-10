export async function runConcurrentBatches<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<void>,
  batchSize = 8,
) {
  if (batchSize < 1) {
    throw new Error('batchSize must be at least 1')
  }

  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize)
    await Promise.all(batch.map((item, index) => worker(item, offset + index)))
  }
}
