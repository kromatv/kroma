// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlOrder } from '#ui/components/organisms/player/lib/nav';
import { TV_FLAGS, WEB_FLAGS } from '#ui/components/organisms/player/types';
import { usePlayerNav } from './use-player-nav';
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

  it('Back with a panel open closes the panel and keeps the film', () => {
    const { result, key, actions } = nav();
    act(() => result.current.openOverlay('settings'));

    key('Back');

    expect(result.current.overlay).toBeNull();
    expect(actions.onExit).not.toHaveBeenCalled();
  });

  it('ignores the directions and OK, which belong to the navigator', () => {
    const { result, key, actions } = nav();

    key('Right');
    key('Enter');

    expect(result.current.revealed).toBe(true);
    expect(actions.togglePlay).not.toHaveBeenCalled();
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

  it('leaves a hidden chrome hidden when a key pauses the film', () => {
    const actions = makeActions();
    const order = controlOrder(WEB_FLAGS, false);
    const view = renderHook(({ playing }) => usePlayerNav(playing, actions, order), {
      initialProps: { playing: true },
    });
    act(() => vi.advanceTimersByTime(3500));

    act(() => view.result.current.handleKey('PlayPause'));
    view.rerender({ playing: false });

    expect(view.result.current.revealed).toBe(false);
  });

  it('leaves a hidden chrome hidden on a seek key', () => {
    const { result, key } = nav(WEB_FLAGS, true);
    act(() => vi.advanceTimersByTime(3500));

    key('FastForward');

    expect(result.current.revealed).toBe(false);
  });

  it('stays revealed while paused (no hide timer)', () => {
    const { result } = nav(WEB_FLAGS, false);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.revealed).toBe(true);
  });

  it('keeps the chrome up while paused after a key press', () => {
    const { result, press } = nav(WEB_FLAGS, false);

    press('right');
    act(() => vi.advanceTimersByTime(10_000));

    expect(result.current.revealed).toBe(true);
  });

  it('does not arm the auto-hide while a panel is open', () => {
    const { result, press } = nav(WEB_FLAGS, true);

    act(() => result.current.openOverlay('settings'));
    press('right');
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
