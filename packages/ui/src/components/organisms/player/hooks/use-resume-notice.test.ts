// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESUME_WINDOW, useResumeNotice } from './use-resume-notice';

function notice(at: number | undefined, cur = at ?? 0, playing = true) {
  return renderHook(
    (props: { at?: number; cur: number; playing: boolean; waiting: boolean }) =>
      useResumeNotice(props),
    { initialProps: { at, cur, playing, waiting: false } },
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useResumeNotice', () => {
  it('says nothing about a film that opened at the start', () => {
    const { result } = notice(undefined, 0);

    expect(result.current.shown).toBe(false);
  });

  it('waits for the picture rather than counting down over a black screen', () => {
    const { result, rerender } = notice(280, 280, false);
    act(() => vi.advanceTimersByTime(RESUME_WINDOW * 1000 + 500));
    expect(result.current.shown).toBe(false);

    rerender({ at: 280, cur: 280, playing: true, waiting: false });

    expect(result.current.shown).toBe(true);
    expect(result.current.secondsLeft).toBe(RESUME_WINDOW);
  });

  it('drains its window a second at a time, then leaves', () => {
    const { result } = notice(280);

    act(() => vi.advanceTimersByTime(2000));

    expect(result.current.secondsLeft).toBe(RESUME_WINDOW - 2);

    act(() => vi.advanceTimersByTime((RESUME_WINDOW - 2) * 1000));

    expect(result.current.shown).toBe(false);
  });

  it('holds still once the viewer has aimed at it, and stops drawing a clock', () => {
    const { result } = notice(280);

    act(() => result.current.holdOpen());
    act(() => vi.advanceTimersByTime(RESUME_WINDOW * 4000));

    expect(result.current.shown).toBe(true);
    expect(result.current.secondsLeft).toBeNull();
  });

  it('goes the moment the viewer seeks, and does not come back', () => {
    const { result, rerender } = notice(280);

    rerender({ at: 280, cur: 290, playing: true, waiting: false });

    expect(result.current.shown).toBe(false);
    rerender({ at: 280, cur: 291, playing: true, waiting: false });
    expect(result.current.shown).toBe(false);
  });

  it('reads a playing film advancing as playback, not as a seek', () => {
    const { result, rerender } = notice(280);

    rerender({ at: 280, cur: 281, playing: true, waiting: false });
    rerender({ at: 280, cur: 283, playing: true, waiting: false });

    expect(result.current.shown).toBe(true);
  });

  it('survives the clock arriving late, which an anchored stream reports as a jump', () => {
    const { result, rerender } = notice(280, 0);

    rerender({ at: 280, cur: 280, playing: true, waiting: false });
    rerender({ at: 280, cur: 281, playing: true, waiting: false });

    expect(result.current.shown).toBe(true);
  });

  it('is offered again for the next episode, which resumed somewhere else', () => {
    const { result, rerender } = notice(280);
    act(() => result.current.dismiss());
    expect(result.current.shown).toBe(false);

    rerender({ at: 40, cur: 40, playing: true, waiting: false });

    expect(result.current.shown).toBe(true);
  });
});
