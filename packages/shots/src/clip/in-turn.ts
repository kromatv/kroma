/** Runs `step` on each item, one after the other, each once the one before it
 *  has settled, and collects what each returned. The first rejection stops it. */
export function inTurn<T, R>(items: readonly T[], step: (item: T) => Promise<R>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(
    (done, item) => done.then(async (results) => [...results, await step(item)]),
    Promise.resolve([]),
  );
}
