// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerController } from '#ui/components/organisms/player/types';
import { useSeekNudge } from './use-seek-nudge';

const TAP_STEP = 10;

function makeController(over: Partial<PlayerController> = {}) {
  return {
    cur: 100,
    dur: 7200,
    scrubPreview: vi.fn(),
    scrubCommit: vi.fn(),
    ...over,
  } as unknown as PlayerController & {
    scrubPreview: ReturnType<typeof vi.fn>;
    scrubCommit: ReturnType<typeof vi.fn>;
  };
}

function lastTarget(c: { scrubPreview: ReturnType<typeof vi.fn> }): number {
  const calls = c.scrubPreview.mock.calls;
  return calls[calls.length - 1]?.[0] as number;
}

let now = 0;

beforeEach(() => {
  now = 1_000_000;
  vi.useFakeTimers();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// The ramp reads `Date.now`, so both clocks have to move.
function advance(ms: number) {
  now += ms;
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useSeekNudge taps', () => {
  it('a single press is a precise 10 s and commits once it settles', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'hold'));
    expect(lastTarget(c)).toBe(110);
    expect(c.scrubCommit).not.toHaveBeenCalled();

    advance(600);
    expect(c.scrubCommit).toHaveBeenCalledTimes(1);
  });

  it('deliberate taps stay 10 s apiece and issue ONE seek for the burst', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'hold'));
    advance(400); // slower than an auto-repeat, faster than the commit window
    act(() => result.current.nudge(1, 'hold'));
    advance(400);
    act(() => result.current.nudge(1, 'hold'));

    // 130, not 110: the taps continue from each other, not from the playhead.
    expect(lastTarget(c)).toBe(130);
    expect(c.scrubCommit).not.toHaveBeenCalled();
    advance(600);
    expect(c.scrubCommit).toHaveBeenCalledTimes(1);
  });
});

describe('useSeekNudge clicks', () => {
  it('moves one exact step per click however fast the clicks come', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'tap'));
    advance(80);
    act(() => result.current.nudge(1, 'tap'));
    advance(80);
    act(() => result.current.nudge(1, 'tap'));

    expect(lastTarget(c)).toBe(130);
  });

  it('shows the viewer the round number the clicks add up to', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'tap'));
    advance(80);
    act(() => result.current.nudge(1, 'tap'));
    advance(80);
    act(() => result.current.nudge(1, 'tap'));

    expect(result.current.burst).toEqual({ dir: 1, deltaSec: 3 * TAP_STEP, rate: 1 });
  });

  it('still issues ONE seek for a run of clicks', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'tap'));
    advance(80);
    act(() => result.current.nudge(1, 'tap'));

    expect(c.scrubCommit).not.toHaveBeenCalled();
    advance(600);
    expect(c.scrubCommit).toHaveBeenCalledTimes(1);
  });

  it('leaves the held key its ramp, so a click never slows the remote down', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'tap'));
    let prev = lastTarget(c);
    const steps: number[] = [];
    for (let i = 0; i < 6; i++) {
      advance(80);
      act(() => result.current.nudge(1, 'hold'));
      const next = lastTarget(c);
      steps.push(next - prev);
      prev = next;
    }

    expect(steps[steps.length - 1]).toBeGreaterThan(TAP_STEP);
  });
});

describe('useSeekNudge hold', () => {
  it('tells the stage a pace that climbs for as long as the key is held', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'hold'));
    const rates: number[] = [];
    for (let i = 0; i < 16; i++) {
      advance(100);
      act(() => result.current.nudge(1, 'hold'));
      rates.push(result.current.burst?.rate ?? 0);
    }

    expect(rates[0]).toBe(1);
    expect(rates.at(-1)).toBeGreaterThan(2);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1] as number);
    }
  });

  it('accelerates: each repeat travels further than the one before', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'hold'));
    const steps: number[] = [];
    let prev = lastTarget(c);
    for (let i = 0; i < 8; i++) {
      advance(80); // an auto-repeating remote
      act(() => result.current.nudge(1, 'hold'));
      const next = lastTarget(c);
      steps.push(next - prev);
      prev = next;
    }

    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1] as number);
    }
    expect(steps[steps.length - 1]).toBeGreaterThan(TAP_STEP);
  });

  it('about a second of holding crosses minutes, not seconds', () => {
    const held = makeController();
    const hook = renderHook(() => useSeekNudge(held));
    act(() => hook.result.current.nudge(1, 'hold'));
    for (let i = 0; i < 12; i++) {
      advance(80);
      act(() => hook.result.current.nudge(1, 'hold'));
    }
    const heldDistance = lastTarget(held) - 100;

    // ~1 s held; tapping thirteen times would have moved only 130 s.
    expect(heldDistance).toBeGreaterThan(200);
  });

  it('reversing restarts the ramp, so backing out of a fast scrub is precise', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'hold'));
    for (let i = 0; i < 10; i++) {
      advance(80);
      act(() => result.current.nudge(1, 'hold'));
    }
    const fast = lastTarget(c);

    advance(80);
    act(() => result.current.nudge(-1, 'hold'));
    expect(lastTarget(c)).toBe(fast - 10);
  });
});

describe('useSeekNudge bounds', () => {
  it('never runs past the end or before the start', () => {
    const c = makeController({ cur: 7195, dur: 7200 } as Partial<PlayerController>);
    const { result } = renderHook(() => useSeekNudge(c));
    act(() => result.current.nudge(1, 'hold'));
    expect(lastTarget(c)).toBe(7199);

    const start = makeController({ cur: 3 } as Partial<PlayerController>);
    const back = renderHook(() => useSeekNudge(start));
    act(() => back.result.current.nudge(-1, 'hold'));
    expect(lastTarget(start)).toBe(0);
  });

  it('an unknown duration still seeks forward', () => {
    const c = makeController({ cur: 10, dur: 0 } as Partial<PlayerController>);
    const { result } = renderHook(() => useSeekNudge(c));
    act(() => result.current.nudge(1, 'hold'));
    expect(lastTarget(c)).toBe(20);
  });
});

describe('what the stage flash is told', () => {
  it('reports a backward seek as a negative distance, which is what picks the glyph', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(-1, 'hold'));

    expect(result.current.burst).toEqual({ dir: -1, deltaSec: -TAP_STEP, rate: 1 });
  });

  it('reports a forward seek as a positive one', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'hold'));

    expect(result.current.burst).toEqual({ dir: 1, deltaSec: TAP_STEP, rate: 1 });
  });

  it('stays positive when a run that went forward turns back one press', () => {
    const c = makeController();
    const { result } = renderHook(() => useSeekNudge(c));

    act(() => result.current.nudge(1, 'hold'));
    advance(400);
    act(() => result.current.nudge(1, 'hold'));
    advance(400);
    act(() => result.current.nudge(-1, 'hold'));

    expect(result.current.burst).toEqual({ dir: -1, deltaSec: TAP_STEP, rate: 1 });
  });
});
