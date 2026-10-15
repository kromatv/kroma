export const ARRIVAL_STALL_POLL_MS = 1_000;

const MOVED_SEC = 0.25;
const AHEAD_SEC = 15;
const EDGE_SEC = 0.5;
const GRACE_MS = 8_000;
const UNSTARTED_GRACE_MS = 20_000;
const COOLDOWN_MS = 30_000;
const MAPLESS_MS = 60_000;
const GROWN_SEC = 5;

type Spans = readonly (readonly [number, number])[];

/** One reading of a watch player. `bufferedSec` is the film second its loaded
 * film runs to, NaN when the player cannot say. `failed` is a player that gave
 * the stream up. `arrived` places bytes by the file's average rate, so it can run
 * tens of seconds ahead of the film a stream can really be cut from. */
export interface ArrivalStallSample {
  atSec: number;
  bufferedSec: number;
  wanted: boolean;
  waiting: boolean;
  failed: boolean;
  started: boolean;
  arrived: Spans | null;
  durationSec: number;
}

export type ArrivalStallStep = 'reload' | 'reanchor';

/**
 * Watches for a player that ran out of film and will not come back by itself: a
 * native player that retried a segment the server could not cut yet stops asking,
 * and one opened on too little film may never start at all. `observe` answers a
 * step on the one sample the stream should be opened again at, and null on every
 * other.
 */
export interface ArrivalStallWatch {
  observe(sample: Readonly<ArrivalStallSample>, nowMs: number): ArrivalStallStep | null;
}

function covers(spans: Spans, fromSec: number, toSec: number): boolean {
  return spans.some(([from, to]) => from <= fromSec + EDGE_SEC && to >= toSec - EDGE_SEC);
}

function reach(spans: Spans, atSec: number): number {
  return spans.reduce(
    (end, [from, to]) =>
      from <= atSec + EDGE_SEC && to >= atSec - EDGE_SEC ? Math.max(end, to) : end,
    atSec,
  );
}

/**
 * Opens the stream again once the playhead has sat still for eight seconds, with
 * nothing more loaded meanwhile, over film that is on disk, the fifteen seconds
 * after it included, and at most once every thirty seconds. A player still
 * loading is waiting at the real edge, and one that keeps up with it resumes by
 * itself. It reloads first, and reanchors only when a reload there bought no
 * progress and left nothing loaded under the playhead: a reload at the real edge
 * loads the film up to it. A player that gave the stream up is only ever
 * reloaded, once the map shows more film arrived since it failed. Without a map
 * it waits a minute instead, which is about where an MSE engine gives up on its
 * own retries.
 */
export function arrivalStallWatch(): ArrivalStallWatch {
  let mark = Number.NaN;
  let loaded = Number.NEGATIVE_INFINITY;
  let stuckSince = 0;
  let coveredSince = Number.NaN;
  let failedReach = Number.NaN;
  let reopenedAt = Number.NEGATIVE_INFINITY;
  let rescuedAtSec = Number.NaN;

  const grew = (sample: Readonly<ArrivalStallSample>, nowMs: number): boolean => {
    if (sample.arrived === null) return nowMs - stuckSince >= MAPLESS_MS;
    const now = reach(sample.arrived, sample.atSec);
    if (Number.isNaN(failedReach)) failedReach = now;
    return now >= failedReach + GROWN_SEC;
  };

  const due = (sample: Readonly<ArrivalStallSample>, nowMs: number): boolean => {
    if (sample.failed) return grew(sample, nowMs);
    if (sample.arrived === null) return nowMs - stuckSince >= MAPLESS_MS;
    const until = sample.durationSec > 0 ? sample.durationSec : Number.POSITIVE_INFINITY;
    if (!covers(sample.arrived, sample.atSec, Math.min(sample.atSec + AHEAD_SEC, until))) {
      coveredSince = Number.NaN;
      return false;
    }
    if (Number.isNaN(coveredSince)) coveredSince = nowMs;
    return nowMs - coveredSince >= (sample.started ? GRACE_MS : UNSTARTED_GRACE_MS);
  };

  return {
    observe(sample, nowMs) {
      const stalled = sample.wanted && (sample.waiting || sample.failed);
      const moved = Number.isNaN(mark) || Math.abs(sample.atSec - mark) > MOVED_SEC;
      const buffered = Number.isNaN(sample.bufferedSec)
        ? Number.NEGATIVE_INFINITY
        : sample.bufferedSec;
      const loading = buffered > loaded + MOVED_SEC;
      loaded = Math.min(loaded, buffered);
      if (!stalled || moved || loading) {
        mark = sample.atSec;
        loaded = buffered;
        stuckSince = nowMs;
        coveredSince = Number.NaN;
        failedReach = Number.NaN;
        return null;
      }
      if (nowMs - reopenedAt < COOLDOWN_MS || !due(sample, nowMs)) return null;
      const again =
        !sample.failed &&
        Number.isNaN(sample.bufferedSec) &&
        sample.atSec > rescuedAtSec - AHEAD_SEC &&
        sample.atSec <= rescuedAtSec + MOVED_SEC;
      reopenedAt = nowMs;
      stuckSince = nowMs;
      coveredSince = Number.NaN;
      failedReach = Number.NaN;
      rescuedAtSec = sample.atSec;
      return again ? 'reanchor' : 'reload';
    },
  };
}
