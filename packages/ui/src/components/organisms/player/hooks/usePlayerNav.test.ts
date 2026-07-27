// @vitest-environment jsdom

import type { RemoteKey } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TV_FLAGS, WEB_FLAGS } from '../types';
import { type PlayerNavActions, usePlayerNav } from './usePlayerNav';

function makeActions(over: Partial<PlayerNavActions> = {}): PlayerNavActions {
  return {
    togglePlay: vi.fn(),
    seekNudge: vi.fn(),
    onNext: vi.fn(),
    hasNext: false,
    volumeNudge: vi.fn(),
    toggleMute: vi.fn(),
    togglePip: vi.fn(),
    toggleFullscreen: vi.fn(),
    onExit: vi.fn(),
    ...over,
  };
}

/** Render the nav machine; `key` presses a logical remote key inside `act`. */
function nav(flags = WEB_FLAGS, playing = false, actions: PlayerNavActions = makeActions()) {
  const view = renderHook(() => usePlayerNav(flags, playing, actions));
  const key = (k: RemoteKey) => act(() => view.result.current.handleKey(k));
  return { ...view, actions, key };
}

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

  it('exposes the flag-computed control row and recomputes on hasNext', () => {
    const { result, rerender } = renderHook(
      ({ hasNext }) => usePlayerNav(WEB_FLAGS, false, makeActions({ hasNext })),
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
    // Clamp at the left end.
    key('Left'); // play -> rewind
    key('Left'); // rewind, clamp
    expect(result.current.focusedControl).toBe('rewind');
  });

  it('Enter on a control runs its action (Play toggles, Subtitles opens a panel)', () => {
    const { result, key, actions } = nav();
    key('Enter'); // Play focused
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
    // Focus the subtitles control, then OK opens the subtitles panel.
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
    key('Up'); // into progress
    key('Left');
    expect(actions.seekNudge).toHaveBeenCalledWith(-1);
    key('Right');
    expect(actions.seekNudge).toHaveBeenCalledWith(1);
    key('Enter');
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('▼ returns to the controls zone; ▲ hides the chrome', () => {
    const { result, key } = nav();
    key('Up'); // progress
    key('Down'); // back to controls
    expect(result.current.zone).toBe('controls');
    key('Up'); // progress again
    key('Up'); // hide
    expect(result.current.revealed).toBe(false);
  });
});

describe('usePlayerNav global + overlay behaviour', () => {
  it('hardware media keys act regardless of zone/overlay', () => {
    const actions = makeActions({ hasNext: true });
    const { key } = nav(WEB_FLAGS, false, actions);
    key('PlayPause');
    expect(actions.togglePlay).toHaveBeenCalled();
    key('Next');
    expect(actions.onNext).toHaveBeenCalled();
    key('Rewind');
    expect(actions.seekNudge).toHaveBeenCalledWith(-1);
    key('FastForward');
    expect(actions.seekNudge).toHaveBeenCalledWith(1);
    key('Stop');
    expect(actions.onExit).toHaveBeenCalled();
  });

  it('Back at the top level exits', () => {
    const { key, actions } = nav();
    key('Back');
    expect(actions.onExit).toHaveBeenCalledTimes(1);
  });

  it('with a panel open only Back closes it (other keys are swallowed)', () => {
    const { result, key, actions } = nav();
    act(() => result.current.openOverlay('settings'));
    expect(result.current.overlay).toBe('settings');
    key('Right'); // swallowed, no control move
    expect(actions.onExit).not.toHaveBeenCalled();
    key('Back');
    expect(result.current.overlay).toBeNull();
  });

  it('while hidden the first key only re-reveals the chrome', () => {
    const actions = makeActions();
    const { result, key } = nav(WEB_FLAGS, true, actions); // playing → auto-hide arms
    act(() => vi.advanceTimersByTime(3500));
    expect(result.current.revealed).toBe(false);
    key('Right');
    expect(result.current.revealed).toBe(true);
    // The key that only revealed did not also move focus off Play.
    expect(result.current.focusedControl).toBe('play');
  });
});

describe('usePlayerNav activate() maps every control', () => {
  it('routes each control id to its action', () => {
    const actions = makeActions({ hasNext: true });
    const { result } = nav(WEB_FLAGS, false, actions);
    act(() => result.current.activate('rewind'));
    expect(actions.seekNudge).toHaveBeenCalledWith(-1);
    act(() => result.current.activate('forward'));
    expect(actions.seekNudge).toHaveBeenCalledWith(1);
    act(() => result.current.activate('next'));
    expect(actions.onNext).toHaveBeenCalled();
    act(() => result.current.activate('volume'));
    expect(actions.toggleMute).toHaveBeenCalled();
    act(() => result.current.activate('pip'));
    expect(actions.togglePip).toHaveBeenCalled();
    act(() => result.current.activate('fullscreen'));
    expect(actions.toggleFullscreen).toHaveBeenCalled();
    act(() => result.current.activate('audio'));
    expect(result.current.overlay).toBe('audio');
  });
});

describe('usePlayerNav auto-hide timer', () => {
  it('hides after the idle window while playing, and a poke re-arms it', () => {
    const { result } = nav(WEB_FLAGS, true);
    expect(result.current.revealed).toBe(true);
    act(() => vi.advanceTimersByTime(3499));
    expect(result.current.revealed).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.revealed).toBe(false);
    act(() => result.current.poke());
    expect(result.current.revealed).toBe(true);
  });

  it('stays revealed while paused (no hide timer)', () => {
    const { result } = nav(WEB_FLAGS, false);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.revealed).toBe(true);
  });

  it('TV flags drop the volume/pip/fullscreen focus stops', () => {
    const { result } = nav(TV_FLAGS, false);
    expect(result.current.controls).not.toContain('volume');
    expect(result.current.controls).not.toContain('fullscreen');
  });
});
