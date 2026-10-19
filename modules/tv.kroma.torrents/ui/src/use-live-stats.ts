import { useServerEvents } from '@kromatv/module-sdk';
import { useState } from 'react';
import type { DownloadStatsEvent, DownloadStatsView, SpeedSample } from './schemas';

const HISTORY_LEN = 180;

/** The polled stats with the live frames laid over them: the rates, the counts
 *  and the trace move at the monitor's sampling cadence, while the totals stay
 *  on whatever the poll last said. Returns `polled` unchanged until a frame
 *  arrives, so a socket that never connects reads exactly as it did before. */
export function useLiveStats(polled: DownloadStatsView): DownloadStatsView {
  const [feed, setFeed] = useState<{ live: DownloadStatsEvent; trail: SpeedSample[] } | null>(null);

  useServerEvents<DownloadStatsEvent>((e) => {
    if (e.type !== 'downloads.stats') return;
    const sample = {
      atMs: Date.now(),
      downBps: e.downBps,
      upBps: e.upBps,
      active: e.active,
      peers: e.peers,
    };
    setFeed((prev) => ({
      live: e,
      trail: [...(prev?.trail.slice(-(HISTORY_LEN - 1)) ?? []), sample],
    }));
  });

  if (!feed) return polled;
  const { live, trail } = feed;
  const polledThrough = polled.history.at(-1)?.atMs ?? 0;
  const since = trail.filter((sample) => sample.atMs > polledThrough);
  return {
    ...polled,
    downBps: live.downBps,
    upBps: live.upBps,
    active: live.active,
    peers: live.peers,
    history: [...polled.history, ...since].slice(-HISTORY_LEN),
  };
}
