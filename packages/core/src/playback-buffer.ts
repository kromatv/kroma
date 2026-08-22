// How much an MSE engine buffers, and how much of that the playhead can reach.
// One module because the two answers share a number: the readout bridges exactly
// the holes the engines are configured to skip, so neither can drift from the other.

import type { MediaItem } from '@kroma/client';

// A remux is segmented at real keyframes while its AAC frames are a fixed
// 21.33 ms, so ffmpeg's fMP4 output leaves sub-frame holes at segment boundaries
// that no player can append over. Holes up to this wide are skipped rather than
// waited on.
const SKIPPABLE_GAP_SEC = 0.5;

// A SourceBuffer's real ceiling belongs to the user agent, not to us, and a goal
// that does not fit costs the whole film in evict-and-re-append. So the goal is a
// byte budget converted to seconds per title, and the budget is hls.js's own
// default: the figure it ships as safe on every device it runs on, which here
// includes televisions with far less to spare than a desktop.
const BUDGET_BYTES = 60 * 1000 * 1000;
const MIN_FORWARD_SEC = 20;
const MAX_FORWARD_SEC = 120;
const MIN_BACK_SEC = 10;
const MAX_BACK_SEC = 60;
// What a title runs at when the catalogue has no size to divide: a 1080p web-dl.
const ASSUMED_BITRATE_BPS = 8_000_000;

/** What one title's buffer may grow to, from [`bufferPlan`]. */
export interface BufferPlan {
  /** Forward goal (s), sized so its bytes stay inside the budget. */
  forwardSec: number;
  /** Kept behind the playhead (s). */
  backSec: number;
  /** Byte ceiling, for the engines that take one. */
  maxBytes: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * The buffer budget for a stream running at `bitrateBps`. A 4 Mb/s web-dl gets
 * minutes; an 80 Mb/s remux gets the seconds that fit in the same bytes, because
 * asking for minutes of one only buys a film-long fight with the browser's quota.
 */
export function bufferPlan(bitrateBps?: number | null): BufferPlan {
  const bitrate = bitrateBps && bitrateBps > 0 ? bitrateBps : ASSUMED_BITRATE_BPS;
  const forwardSec = Math.round(
    clamp((BUDGET_BYTES * 8) / bitrate, MIN_FORWARD_SEC, MAX_FORWARD_SEC),
  );
  return {
    forwardSec,
    backSec: Math.round(clamp(forwardSec / 2, MIN_BACK_SEC, MAX_BACK_SEC)),
    maxBytes: BUDGET_BYTES,
  };
}

// The file the master is remuxed from is the item's own default, which is what
// the server picks when the URL names none.
function averageBitrateBps(item: MediaItem): number | undefined {
  const files = item.files ?? [];
  const file = files.find((f) => f.id === item.defaultFileId) ?? files[0];
  const size = file?.size ?? 0;
  const durationMs = file?.durationMs ?? item.durationMs ?? 0;
  if (size <= 0 || durationMs <= 0) return undefined;
  return (size * 8) / (durationMs / 1000);
}

/** The plan for the file of `item` that will play. */
export function itemBufferPlan(item: MediaItem): BufferPlan {
  return bufferPlan(averageBitrateBps(item));
}

/**
 * The furthest point the playhead can reach from `t` without waiting on a
 * download: the end of the range holding it, carried across every hole the
 * engines skip. `0` when nothing reachable covers `t`.
 *
 * `ranges.end(ranges.length - 1)` answers a different question - the far side of
 * a hole the playhead may be stalled against - and so reads as a healthy buffer
 * at exactly the moment the picture freezes.
 */
export function reachableBufferEnd(ranges: TimeRanges, t: number): number {
  let end = Number.NaN;
  for (let i = 0; i < ranges.length; i += 1) {
    const start = ranges.start(i);
    const stop = ranges.end(i);
    if (Number.isNaN(end)) {
      if (start - t <= SKIPPABLE_GAP_SEC && t <= stop) end = stop;
    } else if (start - end <= SKIPPABLE_GAP_SEC) {
      end = stop;
    } else {
      break;
    }
  }
  return Number.isNaN(end) ? 0 : end;
}

/**
 * hls.js constructor options for `plan`. The gap numbers are the point: hls.js
 * defaults to a 0.1 s `maxBufferHole` and waits 2 s before nudging one, which on
 * a keyframe-cut remux is a frozen picture at a segment boundary.
 */
export function hlsBufferConfig(plan: BufferPlan) {
  return {
    maxBufferLength: plan.forwardSec,
    maxMaxBufferLength: plan.forwardSec,
    maxBufferSize: plan.maxBytes,
    backBufferLength: plan.backSec,
    maxBufferHole: SKIPPABLE_GAP_SEC,
    highBufferWatchdogPeriod: 0.5,
    nudgeOffset: 0.2,
    nudgeMaxRetry: 6,
  };
}

/**
 * The `streaming` half of a Shaka config for `plan`. Shaka bounds its buffer in
 * seconds only, so `forwardSec` is the whole of what keeps it inside the byte
 * budget; its stall detector otherwise sits on a hole for a full second before
 * stepping over it.
 */
export function shakaStreamingConfig(plan: BufferPlan) {
  return {
    bufferingGoal: plan.forwardSec,
    bufferBehind: plan.backSec,
    rebufferingGoal: 4,
    gapDetectionThreshold: SKIPPABLE_GAP_SEC,
    stallThreshold: 0.3,
    stallSkip: 0.2,
  };
}
