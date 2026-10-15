// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArrivalRecovery } from './arrival-recovery';

type Spans = readonly (readonly [number, number])[];

const PLAYING = {
  cur: 160,
  dur: 658,
  wanted: true,
  waiting: false,
  failed: false,
  started: true,
  playing: true,
  bufferedEnd: () => Number.NaN,
};

const GAVE_UP = { ...PLAYING, failed: true, playing: false };

function recovery(arrived: Spans = [[0, 191]], arriving = true, onReopen = vi.fn()) {
  return renderHook(
    ({ played, reached, still }) =>
      useArrivalRecovery({ played, arrived: reached, arriving: still, onReopen }),
    { initialProps: { played: PLAYING, reached: arrived, still: arriving } },
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useArrivalRecovery', () => {
  it('keeps a failure from the viewer while more film can still come', () => {
    const { result, rerender } = recovery();

    rerender({ played: GAVE_UP, reached: [[0, 191]], still: true });

    expect(result.current.recovering).toBe(true);
  });

  it('shows a failure once the whole film has arrived', () => {
    const { result, rerender } = recovery([[0, 658]], false);

    rerender({ played: GAVE_UP, reached: [[0, 658]], still: false });

    expect(result.current.recovering).toBe(false);
  });

  it('shows the third failure in a row with no frame played between them', () => {
    const { result, rerender } = recovery();
    const stalled = { ...PLAYING, playing: false, waiting: true };

    const seen: boolean[] = [];
    for (let round = 0; round < 3; round++) {
      rerender({ played: GAVE_UP, reached: [[0, 191]], still: true });
      seen.push(result.current.recovering);
      rerender({ played: stalled, reached: [[0, 191]], still: true });
    }

    expect(seen).toEqual([true, true, false]);
  });

  it('counts afresh once a frame has played', () => {
    const { result, rerender } = recovery();

    for (let round = 0; round < 3; round++) {
      rerender({ played: GAVE_UP, reached: [[0, 191]], still: true });
      rerender({ played: PLAYING, reached: [[0, 191]], still: true });
    }
    rerender({ played: GAVE_UP, reached: [[0, 191]], still: true });

    expect(result.current.recovering).toBe(true);
  });

  it('reopens a stream it gave up once more film has arrived, and not before', () => {
    const onReopen = vi.fn();
    const { rerender } = recovery([[0, 191]], true, onReopen);

    rerender({ played: GAVE_UP, reached: [[0, 191]], still: true });
    act(() => vi.advanceTimersByTime(60_000));
    const before = onReopen.mock.calls.length;
    rerender({ played: GAVE_UP, reached: [[0, 197]], still: true });
    act(() => vi.advanceTimersByTime(2_000));

    expect(before).toBe(0);
    expect(onReopen).toHaveBeenCalledExactlyOnceWith('reload', 160);
  });
});
