import type { RemoteKey } from '@kroma/core';
import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, type Mock, vi } from 'vitest';
import type { usePlayerNav } from './hooks/use-player-nav';
import { handleCreditsKey, handlePostPlayKey, playerInputHandlers } from './player-input';
import { type PlayerController, type PlayerFlags, WEB_FLAGS } from './types';

function applied<T extends string>(
  setFocus: Mock<Dispatch<SetStateAction<T>>>,
  from: NoInfer<T>,
): T[] {
  return setFocus.mock.calls.map(([next]) => (typeof next === 'function' ? next(from) : next));
}

function credits(focus: 'play' | 'cancel') {
  const setFocus = vi.fn<Dispatch<SetStateAction<'play' | 'cancel'>>>();
  const onPlay = vi.fn();
  const onCancel = vi.fn();
  const press = (key: RemoteKey) => handleCreditsKey(key, focus, setFocus, onPlay, onCancel);
  return { setFocus, onPlay, onCancel, press };
}

function postPlay(focus: 'play' | 'home') {
  const setFocus = vi.fn<Dispatch<SetStateAction<'play' | 'home'>>>();
  const onPlay = vi.fn();
  const onHome = vi.fn();
  const press = (key: RemoteKey) => handlePostPlayKey(key, focus, setFocus, onPlay, onHome);
  return { setFocus, onPlay, onHome, press };
}

describe('the remote over the up-next card in the credits', () => {
  it('swaps the two buttons on either horizontal key', () => {
    const { setFocus, press } = credits('play');

    press('Left');
    press('Right');

    expect(applied(setFocus, 'play')).toEqual(['cancel', 'cancel']);
    expect(applied(setFocus, 'cancel')).toEqual(['play', 'play']);
  });

  it('takes the button that is focused when Enter arrives', () => {
    const focused = credits('play');
    const other = credits('cancel');

    focused.press('Enter');
    other.press('Enter');

    expect(focused.onPlay).toHaveBeenCalledOnce();
    expect(other.onCancel).toHaveBeenCalledOnce();
  });

  it('dismisses the card on Back wherever the focus sits', () => {
    const { onCancel, onPlay, press } = credits('play');

    press('Back');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('claims the keys it acts on and leaves the rest to the player', () => {
    const { press } = credits('play');

    expect(['Left', 'Right', 'Enter', 'Back'].map((k) => press(k as RemoteKey))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(['Up', 'Down', 'Play', 'Stop'].map((k) => press(k as RemoteKey))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('the remote over the end screen', () => {
  it('swaps play and home on either horizontal key', () => {
    const { setFocus, press } = postPlay('play');

    press('Right');

    expect(applied(setFocus, 'play')).toEqual(['home']);
    expect(applied(setFocus, 'home')).toEqual(['play']);
  });

  it('takes the focused button on Enter and on either transport key', () => {
    const { onPlay, press } = postPlay('play');

    for (const key of ['Enter', 'Play', 'PlayPause'] as const) press(key);

    expect(onPlay).toHaveBeenCalledTimes(3);
  });

  it('leaves for home when the focus is on home', () => {
    const { onHome, onPlay, press } = postPlay('home');

    press('Enter');

    expect(onHome).toHaveBeenCalledOnce();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('leaves for home on Back, since there is no player left to return to', () => {
    const { onHome, press } = postPlay('play');

    press('Back');

    expect(onHome).toHaveBeenCalledOnce();
  });

  it('ignores a key neither button answers', () => {
    const { setFocus, onHome, onPlay, press } = postPlay('play');

    press('Up');

    expect(setFocus).not.toHaveBeenCalled();
    expect(onHome).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
  });
});

describe('the pointer and press handlers over the video', () => {
  const build = (flags: Partial<PlayerFlags>, locked = false) => {
    const nav = { poke: vi.fn() } as unknown as ReturnType<typeof usePlayerNav>;
    const controller = {
      togglePlay: vi.fn(),
      toggleFullscreen: vi.fn(),
    } as unknown as PlayerController;
    const handlers = playerInputHandlers(nav, controller, { ...WEB_FLAGS, ...flags }, locked);
    return { nav, controller, handlers };
  };

  it('wakes the chrome when a real mouse moves', () => {
    const { nav, handlers } = build({});

    handlers.onPointerMove({ nativeEvent: { pointerType: 'mouse' } });

    expect(nav.poke).toHaveBeenCalledOnce();
  });

  it('ignores a touch, which already reaches the chrome as a press', () => {
    const { nav, handlers } = build({});

    handlers.onPointerMove({ nativeEvent: { pointerType: 'touch' } });

    expect(nav.poke).not.toHaveBeenCalled();
  });

  it('ignores the phantom moves a magic remote emits on a television', () => {
    const { nav, handlers } = build({ pointer: false });

    handlers.onPointerMove({ nativeEvent: { pointerType: 'mouse' } });

    expect(nav.poke).not.toHaveBeenCalled();
  });

  it('wakes the chrome and toggles playback on a press of the video', () => {
    const { nav, controller, handlers } = build({});

    handlers.onStagePress();

    expect(nav.poke).toHaveBeenCalledOnce();
    expect(controller.togglePlay).toHaveBeenCalledOnce();
  });

  it('takes nothing from a press while the controls are locked', () => {
    const { nav, controller, handlers } = build({}, true);

    handlers.onStagePress();

    expect(nav.poke).not.toHaveBeenCalled();
    expect(controller.togglePlay).not.toHaveBeenCalled();
  });

  it('reads a long press as the request for fullscreen', () => {
    const { controller, handlers } = build({});

    handlers.onStageLongPress();

    expect(controller.toggleFullscreen).toHaveBeenCalledOnce();
  });

  it('leaves a long press alone where the platform has no fullscreen', () => {
    const { controller, handlers } = build({ fullscreen: false });

    handlers.onStageLongPress();

    expect(controller.toggleFullscreen).not.toHaveBeenCalled();
  });
});
