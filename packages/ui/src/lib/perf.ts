// Frame time, JS heap and remote-press-to-focus latency, sampled on the device
// itself.
// Off by default and free when off; turned on by the device setting or by
// `KROMA_PERF=1` before the app boots.

import { readMemory } from './perf-memory';

interface Sample {
  frames: number[];
  responses: number[];
}

const CAPACITY = 240;

const sample: Sample = { frames: [], responses: [] };
let running = false;
let lastFrame = 0;
let pressedAt = 0;
let handle: number | undefined;

function push(into: number[], value: number): void {
  into.push(value);
  if (into.length > CAPACITY) into.shift();
}

function tick(now: number): void {
  if (!running) return;
  if (lastFrame) push(sample.frames, now - lastFrame);
  lastFrame = now;
  handle = requestAnimationFrame(tick);
}

/** Idempotent. */
export function startPerf(): void {
  if (running) return;
  running = true;
  lastFrame = 0;
  handle = requestAnimationFrame(tick);
}

export function stopPerf(): void {
  running = false;
  if (handle !== undefined) cancelAnimationFrame(handle);
  handle = undefined;
}

export function perfRunning(): boolean {
  return running;
}

export function markPress(): void {
  if (running) pressedAt = performance.now();
}

/** Called by every focusable; only the first one after a press counts, the rest
 * of the render is not the viewer's wait. */
export function markFocus(): void {
  if (!running || !pressedAt) return;
  push(sample.responses, performance.now() - pressedAt);
  pressedAt = 0;
}

/** Where the focus sits in the grid that last moved it, as `row,col`, or null
 * off a grid. A remote bug is a bug about WHICH element took focus, and on a
 * television there is no inspector to ask - so the read-out says it. */
let gridAt: { row: number; col: number } | null = null;

/** Called by <VirtualGrid> as focus lands on a tile. */
export function markGridFocus(row: number, col: number): void {
  gridAt = { row, col };
}

export interface PerfReport {
  fps: number;
  worstFrame: number;
  jankyFrames: number;
  frameCount: number;
  responseP50: number;
  responseWorst: number;
  responseCount: number;
  /** The most recent `CHART_FRAMES` durations, oldest first, for the HUD's
   *  chart. An average hides the shape of a stall; this is what shows whether
   *  the last second was evenly slow or one long hitch. */
  frames: readonly number[];
  /** Focused grid cell as `row,col`, or `-` when no grid has the focus. */
  gridCell: string;
  /** JS heap in use, MB, or 0 where the engine reports none. */
  heapMb: number;
  /** What the heap may grow to, MB, or 0 where the engine reports none. */
  heapLimitMb: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** Two 60Hz budgets: one missed frame is noise, two in a row is a stutter. */
const JANK_MS = 33;

/** How many of the ring's samples a report carries: what the HUD's chart draws.
 *  The rest of the window is only ever read as an average, and copying it out
 *  twice a second is work on the device being measured. */
export const CHART_FRAMES = 48;

export function perfReport(): PerfReport {
  const { frames, responses } = sample;
  const heap = readMemory();
  let total = 0;
  let worst = 0;
  let janky = 0;
  for (const ms of frames) {
    total += ms;
    if (ms > worst) worst = ms;
    if (ms > JANK_MS) janky += 1;
  }
  return {
    frames: frames.slice(-CHART_FRAMES),
    gridCell: gridAt ? `${gridAt.row},${gridAt.col}` : '-',
    heapMb: heap?.usedMb ?? 0,
    heapLimitMb: heap?.limitMb ?? 0,
    fps: total > 0 ? Math.round((frames.length / total) * 1000) : 0,
    worstFrame: Math.round(worst),
    jankyFrames: janky,
    frameCount: frames.length,
    responseP50: Math.round(median(responses)),
    responseWorst: Math.round(Math.max(0, ...responses)),
    responseCount: responses.length,
  };
}

export function resetPerf(): void {
  sample.frames.length = 0;
  sample.responses.length = 0;
  lastFrame = 0;
  pressedAt = 0;
  // Where the focus WAS is not a reading about the run that starts now.
  gridAt = null;
}

// Reachable from outside React: the benchmark script and a browser console read
// this. Attached unconditionally so measuring never needs a rebuild.
(globalThis as { KROMA_PERF?: unknown }).KROMA_PERF = {
  start: startPerf,
  stop: stopPerf,
  reset: resetPerf,
  report: perfReport,
};
