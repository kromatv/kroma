import { isImageReady, markImageReady } from './image-ready';

export interface PrefetchQueueOptions {
  /** Fetches and decodes one image; resolves true when it is ready to draw. */
  prefetch: (uri: string) => Promise<boolean>;
  /** Most fetches in flight at once. */
  concurrency: number;
  /** Runs a step when the device is idle. Defaults to running it at once. */
  schedule?: (run: () => void) => void;
}

/** A low-priority image prefetcher that only ever works on the latest wish list. */
export interface PrefetchQueue {
  /** Replace what is wanted, nearest first. Anything no longer listed and not started is dropped. */
  want: (uris: readonly string[]) => void;
}

/** Prefetch images a few at a time, skipping what is already ready and what stopped being wanted. */
export function createPrefetchQueue({
  prefetch,
  concurrency,
  schedule = (run) => run(),
}: PrefetchQueueOptions): PrefetchQueue {
  let pending: string[] = [];
  const inFlight = new Set<string>();
  let queued = false;

  const pump = () => {
    queued = false;
    while (inFlight.size < concurrency && pending.length > 0) {
      const uri = pending.shift();
      if (uri === undefined) break;
      if (isImageReady(uri) || inFlight.has(uri)) continue;
      inFlight.add(uri);
      prefetch(uri)
        .catch(() => false)
        .then((ok) => {
          inFlight.delete(uri);
          if (ok) markImageReady(uri);
          request();
        });
    }
  };

  const request = () => {
    if (queued) return;
    queued = true;
    schedule(pump);
  };

  return {
    want: (uris) => {
      pending = uris.filter((uri) => !isImageReady(uri) && !inFlight.has(uri));
      request();
    },
  };
}
