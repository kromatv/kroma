import { useEffect, useState } from 'react';
import { useImageBackend } from './image-backend';
import { prefetchImage } from './prefetch-image';
import { createPrefetchQueue } from './prefetch-queue';
import { safeImageUrl } from './safe-image-url';

const CONCURRENCY = 3;

function whenIdle(run: () => void): void {
  const idle = globalThis.requestIdleCallback;
  if (idle) idle(run, { timeout: 250 });
  else setTimeout(run, 0);
}

/** Fetch and decode `uris` in order, a few at a time when the device is idle, so
 *  artwork drawn next is ready before it is shown. A new list replaces the old. */
export function usePrefetchAhead(uris: readonly string[]): void {
  const backend = useImageBackend();
  const [queue] = useState(() =>
    createPrefetchQueue({
      prefetch: backend.prefetch ?? prefetchImage,
      concurrency: CONCURRENCY,
      schedule: whenIdle,
    }),
  );

  useEffect(() => {
    queue.want(uris.flatMap((uri) => safeImageUrl(uri) ?? []));
    return () => queue.want([]);
  }, [queue, uris]);
}
