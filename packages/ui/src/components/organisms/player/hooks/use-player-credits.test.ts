// @vitest-environment jsdom

import type { Marker } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerCredits } from './use-player-credits';

type Opts = Parameters<typeof usePlayerCredits>[0];

const DUR = 600;

function base(over: Partial<Opts> = {}): Opts {
  return {
    dur: DUR,
    cur: 0,
    seeking: false,
    endedNonce: 0,
    hasNext: true,
    onAdvance: vi.fn(),
    ...over,
  };
}

const creditsAt = (startMs: number): Marker[] =>
  [{ kind: 'credits', startMs, endMs: startMs + 1000 }] as unknown as Marker[];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlayerCredits', () => {
  it('shows the card once playback reaches the credits marker', () => {
    const { result, rerender } = renderHook((opts: Opts) => usePlayerCredits(opts), {
      initialProps: base({ markers: creditsAt(500_000), cur: 499 }),
    });
    expect(result.current.show).toBe(false);

    rerender(base({ markers: creditsAt(500_000), cur: 500 }));
    expect(result.current.show).toBe(true);
    expect(result.current.secondsLeft).toBe(5);
    expect(result.current.total).toBe(5);
  });

  it('falls back to the last 30 seconds when nothing is marked', () => {
    const { result, rerender } = renderHook((opts: Opts) => usePlayerCredits(opts), {
      initialProps: base({ cur: DUR - 31 }),
    });
    expect(result.current.show).toBe(false);

    rerender(base({ cur: DUR - 29 }));
    expect(result.current.show).toBe(true);
  });

  it('stays hidden on a title shorter than the tail, where the fallback is negative', () => {
    const { result } = renderHook(() => usePlayerCredits(base({ dur: 20, cur: 19 })));
    expect(result.current.show).toBe(false);
  });

  it('stays hidden with nothing to advance to', () => {
    const { result } = renderHook(() =>
      usePlayerCredits(base({ markers: creditsAt(500_000), cur: 540, hasNext: false })),
    );
    expect(result.current.show).toBe(false);
  });

  it('counts down and advances at zero', () => {
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
      usePlayerCredits(base({ markers: creditsAt(500_000), cur: 540, onAdvance })),
    );
    expect(result.current.secondsLeft).toBe(5);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.secondsLeft).toBe(1);
    expect(onAdvance).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.secondsLeft).toBe(0);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('advances once however long the countdown keeps running', () => {
    const onAdvance = vi.fn();
    renderHook(() => usePlayerCredits(base({ markers: creditsAt(500_000), cur: 540, onAdvance })));

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('freezes the countdown while the reader scrubs', () => {
    const onAdvance = vi.fn();
    const { result, rerender } = renderHook((opts: Opts) => usePlayerCredits(opts), {
      initialProps: base({ markers: creditsAt(500_000), cur: 540, onAdvance }),
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.secondsLeft).toBe(2);

    rerender(base({ markers: creditsAt(500_000), cur: 540, seeking: true, onAdvance }));
    expect(result.current.show).toBe(false);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onAdvance).not.toHaveBeenCalled();
    expect(result.current.secondsLeft).toBe(5);
  });

  it('cancelling hides the card and stops the countdown', () => {
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
      usePlayerCredits(base({ markers: creditsAt(500_000), cur: 540, onAdvance })),
    );

    act(() => {
      result.current.cancel();
    });
    expect(result.current.show).toBe(false);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('advances on the real end, even before the card has shown', () => {
    const onAdvance = vi.fn();
    const { rerender } = renderHook((opts: Opts) => usePlayerCredits(opts), {
      initialProps: base({ cur: 10, onAdvance }),
    });
    expect(onAdvance).not.toHaveBeenCalled();

    rerender(base({ cur: 10, endedNonce: 1, onAdvance }));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('does not advance on the real end once cancelled', () => {
    const onAdvance = vi.fn();
    const { result, rerender } = renderHook((opts: Opts) => usePlayerCredits(opts), {
      initialProps: base({ markers: creditsAt(500_000), cur: 540, onAdvance }),
    });

    act(() => {
      result.current.cancel();
    });
    rerender(base({ markers: creditsAt(500_000), cur: 540, endedNonce: 1, onAdvance }));
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('ignores an end that arrives with nothing to advance to', () => {
    const onAdvance = vi.fn();
    renderHook(() => usePlayerCredits(base({ cur: 10, endedNonce: 1, hasNext: false, onAdvance })));
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
