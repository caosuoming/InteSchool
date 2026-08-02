export type AsyncLimiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createAsyncLimiter(maxConcurrent: number): AsyncLimiter {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error("maxConcurrent must be a positive integer");
  }

  let activeCount = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    activeCount -= 1;
    queue.shift()?.();
  };

  return <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    const run = () => {
      activeCount += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(release);
    };

    if (activeCount < maxConcurrent) run();
    else queue.push(run);
  });
}
