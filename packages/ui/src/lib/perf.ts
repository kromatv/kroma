// Measuring how the app actually feels, on the device it actually runs on.
//
// Every performance guess made about this app so far has been wrong at least
// once, and the reason is always the same: a television is not a laptop, and the
// only honest number comes from the television. So this records two things, both
// cheap enough to leave running:
//
//   FRAME TIME  - the gap between painted frames. A 60Hz TV has 16.7ms to spend;
//                 what matters is not the average but the WORST frame, because
//                 that is the one the eye sees as a stutter.
//   RESPONSE    - the gap between a press on the remote and the focus actually
//                 moving. This is what "laggy" means to a viewer, and it is not
//                 the same as frame rate: a screen can hold 60fps and still take
//                 200ms to answer a button.
//
// Off by default and free when off. Turned on by the device setting (or
// `KROMA_PERF=1` before the app boots), read by the on-screen HUD and by the
// benchmark script, which drives the app and prints these numbers.

interface Sample {
  /** Milliseconds between the last two painted frames. */
  frames: number[];
  /** Milliseconds from a remote press to the focus landing. */
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

/** One animation frame: record the gap and ask for the next. */
function tick(now: number): void {
  if (!running) return;
  if (lastFrame) push(sample.frames, now - lastFrame);
  lastFrame = now;
  handle = requestAnimationFrame(tick);
}

/** Start recording. Idempotent. */
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

/** A direction arrived from the remote. Called by the remote bridge. */
export function markPress(): void {
  if (running) pressedAt = performance.now();
}

/** Focus landed somewhere. Called by every focusable, and only the first one
 * after a press counts - the rest of the render is not the viewer's wait. */
export function markFocus(): void {
  if (!running || !pressedAt) return;
  push(sample.responses, performance.now() - pressedAt);
  pressedAt = 0;
}

export interface PerfReport {
  fps: number;
  /** The worst frame in the window, in ms. The stutter you can see. */
  worstFrame: number;
  /** Frames that took longer than two 60Hz budgets. */
  jankyFrames: number;
  frameCount: number;
  /** Median and worst press-to-focus, in ms. */
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

/** Forget everything measured so far, so a run measures one thing. */
export function resetPerf(): void {
  sample.frames.length = 0;
  sample.responses.length = 0;
  lastFrame = 0;
  pressedAt = 0;
}

/**
 * The same numbers, reachable from outside React.
 *
 * The benchmark script drives a real browser and reads this; on a TV the same
 * handle is what a browser console would use. Attached unconditionally: it is
 * four functions on a global, and having to rebuild to measure is exactly how a
 * performance problem survives.
 */
(globalThis as { KROMA_PERF?: unknown }).KROMA_PERF = {
  start: startPerf,
  stop: stopPerf,
  reset: resetPerf,
  report: perfReport,
};
