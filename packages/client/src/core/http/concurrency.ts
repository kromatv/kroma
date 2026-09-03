export type Concurrency = 'share' | 'latest';

// Two signals, one abort: the policy's and the caller's. Built by hand rather
// than with `AbortSignal.any`, which the legacy webOS tier has not got.
function linked(policy: AbortSignal, caller?: AbortSignal): AbortSignal {
  if (!caller) return policy;
  const controller = new AbortController();
  for (const signal of [policy, caller]) {
    if (signal.aborted) return signal;
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/** The policy each request runs under. `share` hands an in-flight promise to an
 * identical call; `latest` aborts the previous call under the same key. Both are
 * keyed per context, so two clients never share a request. */
export function concurrencyGate() {
  const shared = new Map<string, Promise<unknown>>();
  const newest = new Map<string, AbortController>();

  return function underPolicy<T>(
    key: string,
    options: { concurrency?: Concurrency; signal?: AbortSignal } | undefined,
    task: (signal?: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (options?.concurrency === 'share') {
      const running = shared.get(key);
      if (running) return running as Promise<T>;
      const fresh = task().finally(() => shared.delete(key));
      shared.set(key, fresh);
      return fresh;
    }
    if (options?.concurrency === 'latest') {
      newest.get(key)?.abort();
      const controller = new AbortController();
      newest.set(key, controller);
      return task(linked(controller.signal, options.signal)).finally(() => {
        if (newest.get(key) === controller) newest.delete(key);
      });
    }
    return task(options?.signal);
  };
}
