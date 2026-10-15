// @vitest-environment jsdom

import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TV_FLAGS, WEB_FLAGS } from '#ui/components/organisms/player/types';
import { makeActions, nav } from './use-player-nav.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePlayerNav global + overlay behaviour', () => {
  it('hardware media keys act regardless of zone/overlay', () => {
    const actions = makeActions({ hasNext: true });
    const { key } = nav(WEB_FLAGS, false, actions);
    key('PlayPause');
    expect(actions.togglePlay).toHaveBeenCalled();
    key('Next');
    expect(actions.onNext).toHaveBeenCalled();
    key('Rewind');
    expect(actions.seekNudge).toHaveBeenCalledWith(-1, 'hold');
    key('FastForward');
    expect(actions.seekNudge).toHaveBeenCalledWith(1, 'hold');
    key('Stop');
    expect(actions.onExit).toHaveBeenCalled();
  });

  it('Play, Pause and Prev act like their aliases', () => {
    const actions = makeActions();
    const { key } = nav(WEB_FLAGS, false, actions);
    key('Play');
    key('Pause');
    expect(actions.togglePlay).toHaveBeenCalledTimes(2);
    key('Prev');
    expect(actions.seekNudge).toHaveBeenCalledWith(-1, 'hold');
  });

  it('Back puts the chrome away rather than leaving the film', () => {
    const { result, key, actions } = nav();

    key('Back');

    expect(result.current.revealed).toBe(false);
    expect(actions.onExit).not.toHaveBeenCalled();
  });

  it('Back with the chrome already away leaves the player', () => {
    const { result, key, actions } = nav();
    key('Back');

    key('Back');

    expect(result.current.revealed).toBe(false);
    expect(actions.onExit).toHaveBeenCalledWith('back');
  });

  it('with a panel open only Back closes it (other keys are swallowed)', () => {
    const { result, key, actions } = nav();
    act(() => result.current.openOverlay('settings'));
    expect(result.current.overlay).toBe('settings');
    key('Right');
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
    expect(result.current.focusedControl).toBe('play');
  });
});

describe('usePlayerNav activate() maps every control', () => {
  it('routes each control id to its action', () => {
    const actions = makeActions({ hasNext: true });
    const { result } = nav(WEB_FLAGS, false, actions);
    act(() => result.current.activate('rewind'));
    expect(actions.seekNudge).toHaveBeenCalledWith(-1, 'tap');
    act(() => result.current.activate('forward'));
    expect(actions.seekNudge).toHaveBeenCalledWith(1, 'tap');
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
    act(() => result.current.activate('settings'));
    expect(result.current.overlay).toBe('settings');
  });

  it('offers the cast control only while a set is live, and hands the film over', () => {
    const actions = makeActions();
    const { result } = nav({ ...WEB_FLAGS, cast: true }, false, actions);
    expect(result.current.controls.indexOf('cast')).toBe(
      result.current.controls.indexOf('settings') + 1,
    );
    act(() => result.current.activate('cast'));
    expect(actions.onCast).toHaveBeenCalled();

    // No receiver on the network: no button, no focus stop to walk into.
    const { result: none } = nav(WEB_FLAGS, false);
    expect(none.current.controls).not.toContain('cast');
  });
});

describe('usePlayerNav Tab walk', () => {
  it('reaches every zone going forward, ending on the up-next sheet', () => {
    const { result, tab } = nav();
    act(() => result.current.focusControl('rewind'));
    const seen: string[] = [];

    for (let i = 0; i < result.current.controls.length; i++) {
      tab();
      seen.push(
        result.current.overlay ?? `${result.current.zone}:${result.current.focusedControl}`,
      );
    }

    expect(seen[0]).toBe('controls:play');
    expect(seen[seen.length - 2]).toBe('controls:fullscreen');
    expect(seen[seen.length - 1]).toBe('sheet');
  });

  it('climbs off the leftmost control to the seek bar, then to the back button', () => {
    const { result, tab } = nav();
    act(() => result.current.focusControl('play'));

    tab(true);
    expect(result.current.focusedControl).toBe('rewind');
    tab(true);
    expect(result.current.zone).toBe('progress');
    tab(true);
    expect(result.current.zone).toBe('back');
  });

  it('lands on the head of the row rather than the control the remote left', () => {
    const { result, tab } = nav();
    act(() => result.current.focusControl('settings'));
    act(() => result.current.focusProgress());

    tab();

    expect(result.current.focusedControl).toBe('rewind');
  });

  it('steps off the volume control instead of changing the level', () => {
    const actions = makeActions();
    const { result, tab } = nav(WEB_FLAGS, false, actions);
    act(() => result.current.focusControl('volume'));

    tab(true);

    expect(actions.volumeNudge).not.toHaveBeenCalled();
    expect(result.current.focusedControl).toBe('forward');
  });

  it('holds the chrome open at the back button rather than dismissing it', () => {
    const { result, tab } = nav();
    act(() => result.current.focusControl('rewind'));
    tab(true);
    tab(true);

    tab(true);

    expect(result.current.zone).toBe('back');
    expect(result.current.revealed).toBe(true);
  });

  it('stops at the last control when there is nothing up next', () => {
    const { result, tab } = nav(WEB_FLAGS, false, makeActions({ sheetHasItems: false }));
    act(() => result.current.focusControl('fullscreen'));

    tab();

    expect(result.current.overlay).toBeNull();
    expect(result.current.focusedControl).toBe('fullscreen');
  });
});

describe('usePlayerNav pointer focus helpers', () => {
  it('ignores a hover over a control the row does not draw', () => {
    const { result } = nav(TV_FLAGS);
    act(() => result.current.focusControl('fullscreen'));
    expect(result.current.focusedControl).toBe('play');
  });

  it('focusProgress leaves the controls row', () => {
    const { result } = nav();
    act(() => result.current.focusProgress());
    expect(result.current.zone).toBe('progress');
    expect(result.current.focusedControl).toBeNull();
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

  it('keeps the chrome up while paused after a key press', () => {
    const { result, key } = nav(WEB_FLAGS, false);

    key('Right');
    act(() => vi.advanceTimersByTime(10_000));

    expect(result.current.revealed).toBe(true);
  });

  it('does not arm the auto-hide while a panel is open', () => {
    const { result, key } = nav(WEB_FLAGS, true);

    act(() => result.current.openOverlay('settings'));
    key('Right');
    act(() => vi.advanceTimersByTime(10_000));

    expect(result.current.revealed).toBe(true);
    expect(result.current.overlay).toBe('settings');
  });

  it('TV flags drop the volume/pip/fullscreen focus stops', () => {
    const { result } = nav(TV_FLAGS, false);
    expect(result.current.controls).not.toContain('volume');
    expect(result.current.controls).not.toContain('fullscreen');
  });
});
