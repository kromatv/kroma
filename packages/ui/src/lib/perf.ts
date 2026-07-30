// Frame time and remote-press-to-focus latency, sampled on the device itself.
// Off by default and free when off; turned on by the device setting or by
// `KROMA_PERF=1` before the app boots.

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

export interface PerfReport {
  fps: number;
  worstFrame: number;
  jankyFrames: number;
  frameCount: number;
  responseP50: number;
  responseWorst: number;
  responseCount: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** Two 60Hz budgets: one missed frame is noise, two in a row is a stutter. */
const JANK_MS = 33;

export function perfReport(): PerfReport {
  const { frames, responses } = sample;
  const total = frames.reduce((a, b) => a + b, 0);
  return {
    fps: total > 0 ? Math.round((frames.length / total) * 1000) : 0,
    worstFrame: Math.round(Math.max(0, ...frames)),
    jankyFrames: frames.filter((f) => f > JANK_MS).length,
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
}

// Reachable from outside React: the benchmark script and a browser console read
// this. Attached unconditionally so measuring never needs a rebuild.
(globalThis as { KROMA_PERF?: unknown }).KROMA_PERF = {
  start: startPerf,
  stop: stopPerf,
  reset: resetPerf,
  report: perfReport,
};
