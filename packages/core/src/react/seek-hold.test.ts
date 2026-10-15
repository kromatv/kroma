// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type HeldSeekTransport, useHeldSeek } from './seek-hold';

function transport(over: Partial<HeldSeekTransport> = {}): HeldSeekTransport {
  return {
    cur: 60,
    dur: 600,
    waiting: false,
    seekPreview: null,
    seekTo: vi.fn(),
    skip: vi.fn(),
    scrubCommit: vi.fn(),
    ...over,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('what the chrome draws after a seek is committed', () => {
  it('draws the target rather than where the film still is', () => {
    const { result } = renderHook(() => useHeldSeek(transport()));

    act(() => result.current.seekTo(300));

    expect(result.current.cur).toBe(300);
  });

  it('shows the wait at the target, so the viewer sees it working', () => {
    const { result } = renderHook(() => useHeldSeek(transport()));

    act(() => result.current.seekTo(300));

    expect(result.current.waiting).toBe(true);
  });

  it('lets go once playback arrives', () => {
    const { result, rerender } = renderHook(({ cur }) => useHeldSeek(transport({ cur })), {
      initialProps: { cur: 60 },
    });
    act(() => result.current.seekTo(300));

    rerender({ cur: 299.2 });

    expect(result.current.cur).toBe(299.2);
    expect(result.current.waiting).toBe(false);
  });

  it('goes back to the film after twenty seconds of a seek that never lands', () => {
    const { result, rerender } = renderHook(({ cur }) => useHeldSeek(transport({ cur })), {
      initialProps: { cur: 60 },
    });
    act(() => result.current.seekTo(300));

    act(() => vi.advanceTimersByTime(20_000));
    rerender({ cur: 61 });

    expect(result.current.cur).toBe(61);
  });

  it('replaces a pending seek rather than queueing behind it', () => {
    const seekTo = vi.fn();
    const { result } = renderHook(() => useHeldSeek(transport({ seekTo })));

    act(() => result.current.seekTo(300));
    act(() => result.current.seekTo(420));

    expect(result.current.cur).toBe(420);
    expect(seekTo.mock.calls).toEqual([[300], [420]]);
  });

  it('holds a dropped scrub handle where it was dropped', () => {
    const { result } = renderHook(() => useHeldSeek(transport({ seekPreview: 450 })));

    act(() => result.current.scrubCommit?.());

    expect(result.current.cur).toBe(450);
  });

  it('counts a skip from where the chrome draws, not from the stale element', () => {
    const seekTo = vi.fn();
    const { result } = renderHook(() => useHeldSeek(transport({ seekTo })));

    act(() => result.current.seekTo(300));
    act(() => result.current.skip(10));

    expect(seekTo).toHaveBeenLastCalledWith(310);
  });

  it('never aims past the end of the film, which nothing would ever reach', () => {
    const { result } = renderHook(() => useHeldSeek(transport()));

    act(() => result.current.seekTo(9_000));

    expect(result.current.cur).toBe(600);
  });

  it.each([
    {
      when: 'stops showing the wait once a re-anchored stream opens short of the target',
      tick: 477,
      cur: 477,
      waiting: false,
    },
    {
      when: 'keeps the target while the old stream plays on under it',
      tick: 60.25,
      cur: 480,
      waiting: true,
    },
    {
      when: 'keeps the target while the element between two streams reads nothing',
      tick: 0,
      cur: 480,
      waiting: true,
    },
  ])('$when', ({ tick, cur, waiting }) => {
    const { result, rerender } = renderHook((props) => useHeldSeek(transport(props)), {
      initialProps: { cur: 60, waiting: false },
    });
    act(() => result.current.seekTo(480));

    rerender({ cur: tick, waiting: false });

    expect(result.current.cur).toBe(cur);
    expect(result.current.waiting).toBe(waiting);
  });

  it('lets go the moment a shell that names its streams opens a new one', () => {
    const { result, rerender } = renderHook(
      ({ cur, anchor }) => useHeldSeek(transport({ cur, anchor })),
      { initialProps: { cur: 60, anchor: 0 } },
    );
    act(() => result.current.seekTo(480));

    rerender({ cur: 477, anchor: 477 });

    expect(result.current.cur).toBe(477);
    expect(result.current.waiting).toBe(false);
  });

  it('ignores a tick of the stream the seek left, however far it runs', () => {
    const { result, rerender } = renderHook(
      ({ cur, anchor }) => useHeldSeek(transport({ cur, anchor })),
      { initialProps: { cur: 60, anchor: 0 } },
    );
    act(() => result.current.seekTo(480));

    rerender({ cur: 470, anchor: 0 });

    expect(result.current.cur).toBe(480);
  });
});
