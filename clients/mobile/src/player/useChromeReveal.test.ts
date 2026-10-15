// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChromeReveal } from './useChromeReveal';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

function holdOn(reveal: { current: ReturnType<typeof useChromeReveal> }): () => void {
  let release: () => void = () => undefined;
  act(() => {
    release = reveal.current.hold();
  });
  return () => act(release);
}

describe('controls left alone', () => {
  it('go four seconds after they came up', () => {
    const { result } = renderHook(() => useChromeReveal());

    wait(3_999);
    const before = result.current.shown;
    wait(1);

    expect(before).toBe(true);
    expect(result.current.shown).toBe(false);
  });
});

describe('controls held', () => {
  it('stay up for as long as the hold lasts, and go four seconds after it ends', () => {
    const { result } = renderHook(() => useChromeReveal());

    const release = holdOn(result);
    wait(20_000);
    const held = result.current.shown;
    release();
    wait(3_999);
    const after = result.current.shown;
    wait(1);

    expect(held).toBe(true);
    expect(after).toBe(true);
    expect(result.current.shown).toBe(false);
  });

  it('count the four seconds from the last of two holds', () => {
    const { result } = renderHook(() => useChromeReveal());

    const scrub = holdOn(result);
    const finger = holdOn(result);
    scrub();
    scrub();
    wait(10_000);
    const stillHeld = result.current.shown;
    finger();
    wait(4_000);

    expect(stillHeld).toBe(true);
    expect(result.current.shown).toBe(false);
  });

  it('come back when a hold starts while they are hidden', () => {
    const { result } = renderHook(() => useChromeReveal());

    wait(4_000);
    holdOn(result);

    expect(result.current.shown).toBe(true);
  });

  it('are not hidden by a tap on the picture', () => {
    const { result } = renderHook(() => useChromeReveal());

    holdOn(result);
    act(() => result.current.toggle());

    expect(result.current.shown).toBe(true);
  });
});

describe('a tap on the picture', () => {
  it('hides controls that are up and brings back ones that are not', () => {
    const { result } = renderHook(() => useChromeReveal());

    act(() => result.current.toggle());
    const hidden = result.current.shown;
    act(() => result.current.toggle());

    expect(hidden).toBe(false);
    expect(result.current.shown).toBe(true);
  });
});
