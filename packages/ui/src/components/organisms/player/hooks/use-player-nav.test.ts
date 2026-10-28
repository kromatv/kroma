// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlOrder } from '#ui/components/organisms/player/lib/nav';
import { WEB_FLAGS } from '#ui/components/organisms/player/types';
import { usePlayerNav } from './use-player-nav';
import { makeActions, nav } from './use-player-nav.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePlayerNav initial state', () => {
  it('reveals, sits in the controls zone, and focuses Play first', () => {
    const { result } = nav();
    expect(result.current.revealed).toBe(true);
    expect(result.current.zone).toBe('controls');
    expect(result.current.overlay).toBeNull();
    expect(result.current.focusedControl).toBe('play');
  });

  it('exposes the control row it was given and follows it when hasNext appears', () => {
    const { result, rerender } = renderHook(
      ({ hasNext }) =>
        usePlayerNav(false, makeActions({ hasNext }), controlOrder(WEB_FLAGS, hasNext)),
      { initialProps: { hasNext: false } },
    );
    expect(result.current.controls).not.toContain('next');
    rerender({ hasNext: true });
    expect(result.current.controls[3]).toBe('next');
  });
});

describe('usePlayerNav controls-row navigation', () => {
  it('◀ ▶ walk the focused control and clamp at the ends', () => {
    const { result, key } = nav();
    key('Right');
    expect(result.current.focusedControl).toBe('forward');
    key('Left');
    expect(result.current.focusedControl).toBe('play');
    key('Left');
    key('Left');
    expect(result.current.focusedControl).toBe('rewind');
  });

  it('Enter on a control runs its action (Play toggles, Subtitles opens a panel)', () => {
    const { result, key, actions } = nav();
    key('Enter');
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
    act(() => result.current.focusControl('subtitles'));
    key('Enter');
    expect(result.current.overlay).toBe('subtitles');
  });

  it('▲ enters the progress zone (no control focused there)', () => {
    const { result, key } = nav();
    key('Up');
    expect(result.current.zone).toBe('progress');
    expect(result.current.focusedControl).toBeNull();
  });

  it('▼ from the controls opens the up-next sheet', () => {
    const { result, key } = nav();
    key('Down');
    expect(result.current.overlay).toBe('sheet');
  });

  it('on the volume control ▲/▼ nudge volume instead of changing zone', () => {
    const actions = makeActions();
    const { result, key } = nav(WEB_FLAGS, false, actions);
    act(() => result.current.focusControl('volume'));
    key('Up');
    expect(actions.volumeNudge).toHaveBeenCalledWith(1);
    expect(result.current.zone).toBe('controls');
    key('Down');
    expect(actions.volumeNudge).toHaveBeenCalledWith(-1);
  });
});

describe('usePlayerNav progress zone', () => {
  it('◀ ▶ nudge the seek and Enter toggles play', () => {
    const actions = makeActions();
    const { key } = nav(WEB_FLAGS, false, actions);
    key('Up');
    key('Left');
    expect(actions.seekNudge).toHaveBeenCalledWith(-1, 'hold');
    key('Right');
    expect(actions.seekNudge).toHaveBeenCalledWith(1, 'hold');
    key('Enter');
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('▼ returns to the controls zone; ▲ climbs to Back, then hides the chrome', () => {
    const { result, key } = nav();
    key('Up');
    key('Down');
    expect(result.current.zone).toBe('controls');
    key('Up');
    expect(result.current.zone).toBe('progress');
    // The top chrome's Back button is a zone of its own: without it ▲ ran out of
    // places to go and dismissed the chrome, leaving the button unreachable.
    key('Up');
    expect(result.current.zone).toBe('back');
    expect(result.current.revealed).toBe(true);
    key('Up');
    expect(result.current.revealed).toBe(false);
  });

  it('▼ from Back returns to the progress zone', () => {
    const { result, key } = nav();
    key('Up');
    key('Up');
    expect(result.current.zone).toBe('back');
    key('Down');
    expect(result.current.zone).toBe('progress');
  });

  it('OK on Back leaves the player', () => {
    const actions = makeActions();
    const { key } = nav(WEB_FLAGS, false, actions);
    key('Up');
    key('Up');
    key('Enter');
    expect(actions.onExit).toHaveBeenCalledTimes(1);
  });
});

describe('usePlayerNav with an empty control row', () => {
  it('focuses nothing, and ◀ ▶ and OK have nowhere to land', () => {
    const actions = makeActions();
    const { result } = renderHook(() => usePlayerNav(false, actions, []));
    expect(result.current.focusedControl).toBeNull();
    act(() => result.current.handleKey('Right'));
    act(() => result.current.handleKey('Left'));
    expect(result.current.focusedControl).toBeNull();
    act(() => result.current.handleKey('Enter'));
    expect(actions.togglePlay).not.toHaveBeenCalled();
  });
});
