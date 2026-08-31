import type { VpnBandwidthView } from './schemas';

export type BandwidthDirection = 'down' | 'up';

export interface BandwidthPoint {
  at: string;
  sealed: number;
  unsealed: number;
  bypass: number;
  [field: string]: number | string;
}

const COLUMNS = {
  down: ['sealedDown', 'unsealedDown', 'bypassDown'],
  up: ['sealedUp', 'unsealedUp', 'bypassUp'],
} as const satisfies Record<BandwidthDirection, readonly [string, string, string]>;

/**
 * One point per bucket, oldest first. `nameAt` is handed the unix second the
 * bucket opens on. A column the server sent short is read as zero rather than
 * dropping the bucket.
 */
export function bandwidthPoints(
  view: VpnBandwidthView,
  direction: BandwidthDirection,
  nameAt: (atSec: number) => string,
): BandwidthPoint[] {
  const [sealed, unsealed, bypass] = COLUMNS[direction];
  const buckets = view.series[sealed].length;
  const points: BandwidthPoint[] = [];
  for (let at = 0; at < buckets; at += 1) {
    points.push({
      at: nameAt(view.startedAt + at * view.stepSecs),
      sealed: view.series[sealed][at] ?? 0,
      unsealed: view.series[unsealed][at] ?? 0,
      bypass: view.series[bypass][at] ?? 0,
    });
  }
  return points;
}
