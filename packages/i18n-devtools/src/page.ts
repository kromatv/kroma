/**
 * A record the whole page shares, however many copies of a module ask for it.
 *
 * Two things make one necessary. A hot update re-runs the module the tools were
 * injected into, so anything the tools hold in a module variable would be
 * cleared by the very refresh meant to show its effect. And a KROMA module's
 * front end bundles its own copy of this package, so a module variable would
 * reach the core's strings and stop at the module's.
 *
 * Returns the reader; `make` runs once, the first time anything asks.
 */
export function pageRecord<T extends object>(key: string, make: () => T): () => T {
  return () => {
    const found = Reflect.get(globalThis, key) as T | undefined;
    if (found) return found;
    const fresh = make();
    Reflect.set(globalThis, key, fresh);
    return fresh;
  };
}
