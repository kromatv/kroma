import { type Activity, type KromaClient, KromaEvents } from '@kroma/core';
import { useEffect, useState } from 'react';

const EMPTY_ACTIVITY: Activity = {
  phase: 'idle',
  scanning: false,
  libraries: 0,
  shows: 0,
  items: 0,
  enrichDone: 0,
  enrichTotal: 0,
  probeDone: 0,
  probeTotal: 0,
  lastScanAt: null,
};
const base = (a: Activity | null): Activity => a ?? EMPTY_ACTIVITY;

/** Holds the server's event stream open while signed in, mapping scan/enrich
 * events onto the reported activity and coalescing catalog changes into a
 * throttled refetch. */
export function useCatalogueSync(
  client: KromaClient | null,
  signedIn: boolean,
  fetchCatalogue: (c: KromaClient, quiet?: boolean) => Promise<void>,
  recheck: () => void,
): Activity | null {
  const [activity, setActivity] = useState<Activity | null>(null);

  // Live sync: hold the event stream open and refetch when the catalog changes.
  // A leading+trailing throttle coalesces bursts into at most one refetch/window.
  // Only while signed in the picker keeps the stream (and /api/status) closed.
  useEffect(() => {
    if (!client || !signedIn) return;
    const MIN_MS = 2500;
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      last = Date.now();
      void fetchCatalogue(client, true);
    };
    const trigger = () => {
      const since = Date.now() - last;
      if (since >= MIN_MS) run();
      else {
        clearTimeout(trailing);
        trailing = setTimeout(run, MIN_MS - since);
      }
    };
    const events = new KromaEvents(client.baseUrl, {
      // The stream open/close is the fastest signal that the server just came
      // back or dropped; nudge the heartbeat to confirm reachability at once
      // rather than waiting for its next tick.
      onClose: () => recheck(),
      onOpen: () => {
        recheck();
        void client
          .status()
          .then(setActivity)
          .catch(() => undefined);
      },
      onEvent: (e) => {
        switch (e.type) {
          case 'scan.started':
            setActivity((a) => ({ ...base(a), phase: 'scanning', scanning: true }));
            break;
          case 'scan.completed':
            setActivity((a) => ({
              ...base(a),
              phase: 'ready',
              scanning: false,
              libraries: e.libraries,
              shows: e.shows,
              items: e.items,
            }));
            trigger();
            break;
          case 'enrich.progress':
            setActivity((a) => ({
              ...base(a),
              phase: 'enriching',
              enrichDone: e.done,
              enrichTotal: e.total,
            }));
            break;
          case 'enrich.completed':
            setActivity((a) => ({
              ...base(a),
              phase: 'ready',
              enrichDone: e.resolved,
              enrichTotal: e.total,
            }));
            trigger();
            break;
          case 'library.updated':
          case 'item.updated':
          case 'show.updated':
            trigger();
            break;
          default:
            break;
        }
      },
    });
    events.connect();
    return () => {
      clearTimeout(trailing);
      events.close();
    };
  }, [client, signedIn, fetchCatalogue, recheck]);

  return activity;
}
