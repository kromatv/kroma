// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlOrder } from '#ui/components/organisms/player/lib/nav';
import { WEB_FLAGS } from '#ui/components/organisms/player/types';
import { usePlayerNav } from './use-player-nav';
import { makeActions, nav } from './use-player-nav.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function hidden(actions = makeActions()) {
  const view = nav(WEB_FLAGS, true, actions);
  act(() => vi.advanceTimersByTime(3500));
  return view;
}

describe('usePlayerNav initial state', () => {
  it('starts revealed with no panel open and no spot focused', () => {
    const { result } = nav();

    expect(result.current.revealed).toBe(true);
    expect(result.current.overlay).toBeNull();
    expect(result.current.spot).toBeNull();
  });

  it('exposes the control row it was given and follows it when hasNext appears', () => {
    const { result, rerender } = renderHook(
      ({ hasNext }) =>
        usePlayerNav(false, makeActions({ hasNext }), controlOrder(WEB_FLAGS, hasNext)),
      { initialProps: { hasNext: false } },
    );

    rerender({ hasNext: true });

    expect(result.current.controls[3]).toBe('next');
  });
});

describe('usePlayerNav focus reports', () => {
  it('records the spot a part reports focus on', () => {
    const { result } = nav();

    act(() => result.current.focus('progress'));

    expect(result.current.spot).toBe('progress');
  });

  it('clears the spot when the part holding it blurs', () => {
    const { result } = nav();
    act(() => result.current.focus('play'));

    act(() => result.current.blur('play'));

    expect(result.current.spot).toBeNull();
  });

  it('keeps the spot when a part that no longer holds it blurs late', () => {
    const { result } = nav();
    act(() => result.current.focus('play'));
    act(() => result.current.focus('forward'));

    act(() => result.current.blur('play'));

    expect(result.current.spot).toBe('forward');
  });
});

describe('usePlayerNav chromeKey', () => {
  it('lets the navigator move when the chrome is shown', () => {
    const { result, press } = nav();
    act(() => result.current.focus('play'));

    expect(press('right')).toBe(false);
  });

  it('takes the first press on a hidden chrome and reveals it', () => {
    const { result, press } = hidden();

    const taken = press('right');

    expect(taken).toBe(true);
    expect(result.current.revealed).toBe(true);
  });

  it('lets the skip pill take a press while the chrome is hidden', () => {
    const { result, press } = hidden();
    act(() => result.current.focus('skip'));

    const taken = press('down');

    expect(taken).toBe(false);
    expect(result.current.revealed).toBe(false);
  });

  it('hides the chrome on Up from the back button', () => {
    const { result, press } = nav();
    act(() => result.current.focus('back'));

    const taken = press('up');

    expect(taken).toBe(true);
    expect(result.current.revealed).toBe(false);
  });

  it('opens the up-next sheet on Down from a control', () => {
    const { result, press } = nav();
    act(() => result.current.focus('settings'));

    const taken = press('down');

    expect(taken).toBe(true);
    expect(result.current.overlay).toBe('sheet');
  });

  it('keeps Down on the row when there is nothing up next', () => {
    const { result, press } = nav(WEB_FLAGS, false, makeActions({ sheetHasItems: false }));
    act(() => result.current.focus('play'));

    const taken = press('down');

    expect(taken).toBe(true);
    expect(result.current.overlay).toBeNull();
  });

  it('lets Down from the seek bar reach the row', () => {
    const { result, press } = nav();
    act(() => result.current.focus('progress'));

    const taken = press('down');

    expect(taken).toBe(false);
    expect(result.current.overlay).toBeNull();
  });
});
