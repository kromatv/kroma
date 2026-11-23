import { monotonicNow } from './clock';
import { readServerTiming } from './server-timing';
import type { TimingSink } from './timing-sink';

/** The route of the report itself, which is never reported. */
export const TIMING_REPORT_ROUTE = 'POST /api/perf/client';

function serverTimingOf(response: Response): string | null {
  try {
    return response.headers.get('server-timing');
  } catch {
    return null;
  }
}

/** Wrap `fetchFn` so every answer a KROMA server timed adds a sample to `sink`:
 *  the route the server named, how long the device waited for the headers, and
 *  the server's own share of it. */
export function withTimings(
  fetchFn: typeof globalThis.fetch,
  sink: TimingSink,
  now: () => number = monotonicNow,
): typeof globalThis.fetch {
  return async (input, init) => {
    const started = now();
    const response = await fetchFn(input, init);
    const timing = readServerTiming(serverTimingOf(response));
    if (timing && timing.route !== TIMING_REPORT_ROUTE) {
      sink.add({ kind: 'api', name: timing.route, ms: now() - started, serverMs: timing.serverMs });
    }
    return response;
  };
}
