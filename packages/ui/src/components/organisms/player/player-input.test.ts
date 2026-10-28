import { describe, expect, it, vi } from 'vitest';
import type { usePlayerNav } from './hooks/use-player-nav';
import { playerInputHandlers } from './player-input';
import { type PlayerController, type PlayerFlags, WEB_FLAGS } from './types';

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
