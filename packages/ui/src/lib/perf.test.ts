// The on-device performance recorder.
//
// Its whole point is that a television is not a laptop, so the numbers have to
// come from the device - which means the numbers themselves are the product,
// and a recorder that quietly reports the wrong thing is worse than none. What
// is pinned here is the arithmetic: the WORST frame (the stutter an eye sees,
// which an average hides), the jank count, and press-to-focus.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markFocus,
  markPress,
  perfReport,
  perfRunning,
  resetPerf,
  startPerf,
  stopPerf,
} from './perf';

/** Drives rAF by hand so a "frame" is whatever timestamp the test says. */
function frameClock() {
  let cb: ((now: number) => void) | null = null;
  vi.stubGlobal('requestAnimationFrame', (fn: (now: number) => void) => {
    cb = fn;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return {
    /** Paint frames at these absolute timestamps, in order. */
    paint(...at: number[]) {
      for (const t of at) {
        const next = cb;
        cb = null;
        next?.(t);
      }
    },
  };
}

/** performance.now(), under the test's control. */
function clock(start = 1_000) {
  let t = start;
  vi.stubGlobal('performance', { now: () => t });
  return { advance: (ms: number) => (t += ms) };
}

beforeEach(() => {
  resetPerf();
  stopPerf();
});

afterEach(() => {
  stopPerf();
  resetPerf();
  vi.unstubAllGlobals();
});

describe('start / stop', () => {
  it('starts, reports running, and stops', () => {
    frameClock();
    expect(perfRunning()).toBe(false);
    startPerf();
    expect(perfRunning()).toBe(true);
    stopPerf();
    expect(perfRunning()).toBe(false);
  });

  it('is idempotent: starting twice asks for one frame loop', () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    startPerf();
    startPerf();
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('records nothing once stopped', () => {
    const frames = frameClock();
    startPerf();
    frames.paint(100, 116);
    stopPerf();
    const before = perfReport().frameCount;
    frames.paint(132, 148);
    expect(perfReport().frameCount).toBe(before);
  });
});

describe('perfReport', () => {
  it('reads as empty before anything is measured', () => {
    expect(perfReport()).toMatchObject({ fps: 0, worstFrame: 0, frameCount: 0, responseCount: 0 });
  });

  // The first painted frame has no predecessor, so it contributes no gap: three
  // paints describe two intervals.
  it('measures the gaps between frames, not the frames', () => {
    const frames = frameClock();
    startPerf();
    frames.paint(100, 116, 132);
    expect(perfReport().frameCount).toBe(2);
  });

  it('reports the worst frame, which an average would hide', () => {
    const frames = frameClock();
    startPerf();
    // Nineteen good frames and one 200ms stall: the mean stays near 60fps.
    const times = [100];
    for (let i = 1; i <= 19; i++) times.push(100 + i * 16);
    times.push(times[times.length - 1]! + 200);
    frames.paint(...times);
    const report = perfReport();
    expect(report.worstFrame).toBe(200);
    expect(report.jankyFrames).toBe(1);
  });

  it('counts a frame as janky only past two 60Hz budgets', () => {
    const frames = frameClock();
    startPerf();
    // 33ms is the threshold itself, so it is not jank; 34 is.
    frames.paint(100, 133, 167);
    expect(perfReport().jankyFrames).toBe(1);
  });

  it('derives fps from the total elapsed time', () => {
    const frames = frameClock();
    startPerf();
    // Ten gaps of 20ms = 200ms for 10 frames = 50fps.
    frames.paint(...Array.from({ length: 11 }, (_, i) => 100 + i * 20));
    expect(perfReport().fps).toBe(50);
  });
});

describe('press-to-focus', () => {
  it('measures the wait from the remote press to the focus landing', () => {
    frameClock();
    const time = clock();
    startPerf();
    markPress();
    time.advance(120);
    markFocus();
    expect(perfReport()).toMatchObject({ responseCount: 1, responseP50: 120 });
  });

  // Only the FIRST focus after a press is the viewer's wait; everything else
  // the render moves afterwards is not something anybody waited for.
  it('counts only the first focus after each press', () => {
    frameClock();
    const time = clock();
    startPerf();
    markPress();
    time.advance(50);
    markFocus();
    time.advance(50);
    markFocus();
    expect(perfReport().responseCount).toBe(1);
  });

  it('ignores a focus that no press preceded', () => {
    frameClock();
    clock();
    startPerf();
    markFocus();
    expect(perfReport().responseCount).toBe(0);
  });

  it('records nothing at all while stopped', () => {
    frameClock();
    const time = clock();
    markPress();
    time.advance(80);
    markFocus();
    expect(perfReport().responseCount).toBe(0);
  });

  it('reports the median and the worst response', () => {
    frameClock();
    const time = clock();
    startPerf();
    for (const wait of [10, 300, 20]) {
      markPress();
      time.advance(wait);
      markFocus();
    }
    const report = perfReport();
    expect(report.responseWorst).toBe(300);
    expect(report.responseP50).toBe(20);
  });
});

describe('resetPerf', () => {
  it('forgets everything, so a run measures one thing', () => {
    const frames = frameClock();
    startPerf();
    frames.paint(100, 116, 132);
    resetPerf();
    expect(perfReport()).toMatchObject({ frameCount: 0, responseCount: 0 });
  });
});
