import { useServerEvents } from '@kroma/module-sdk';
import { useRef, useState } from 'react';
import type { DownloadStatsEvent, DownloadStatsView, SpeedSample } from './schemas';

const HISTORY_LEN = 180;

/** The polled stats with the live frames laid over them: the rates, the counts
 *  and the trace move at the monitor's sampling cadence, while the totals stay
 *  on whatever the poll last said. Returns `polled` unchanged until a frame
 *  arrives, so a socket that never connects reads exactly as it did before. */
export function useLiveStats(polled: DownloadStatsView): DownloadStatsView {
  const [live, setLive] = useState<DownloadStatsEvent | null>(null);
  const trail = useRef<SpeedSample[]>([]);

  useServerEvents<DownloadStatsEvent>((e) => {
    if (e.type !== 'downloads.stats') return;
    trail.current = [
      ...trail.current.slice(-(HISTORY_LEN - 1)),
      { atMs: Date.now(), downBps: e.downBps, upBps: e.upBps, active: e.active, peers: e.peers },
    ];
    setLive(e);
  });

  if (!live) return polled;
  const polledThrough = polled.history.at(-1)?.atMs ?? 0;
  const since = trail.current.filter((sample) => sample.atMs > polledThrough);
  return {
    ...polled,
    downBps: live.downBps,
    upBps: live.upBps,
    active: live.active,
    peers: live.peers,
    history: [...polled.history, ...since].slice(-HISTORY_LEN),
  };
}
