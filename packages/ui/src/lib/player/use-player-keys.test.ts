// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import type { PlayerController } from '#ui/components/organisms/player/types';
import { WEB_FLAGS } from '#ui/components/organisms/player/types';
import { usePlayerKeys } from './use-player-keys';
import type { PlayerNav } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { SeekPress } from '#ui/components/organisms/player/hooks/use-seek-nudge';

function makeController(): PlayerController {
  return {
    cur: 0,
    dur: 0,
    bufEnd: 0,
    seekPreview: null,
    playing: false,
    waiting: false,
    ready: true,
    error: null,
    endedNonce: 0,
    surface: 'video',
    togglePlay: vi.fn(),
    seekTo: vi.fn(),
    skip: vi.fn(),
    scrubPreview: vi.fn(),
    scrubCommit: vi.fn(),
    volume: 1,
    muted: false,
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    rate: 1,
    setRate: vi.fn(),
    audioTracks: [],
    audioIndex: 0,
    setAudio: vi.fn(),
    subtitles: [],
    subtitleIndex: null,
    setSubtitle: vi.fn(),
    qualities: [],
    qualityId: 'auto',
    setQuality: vi.fn(),
    audioFilter: 'off',
    setAudioFilter: vi.fn(),
    audioFilterSupported: false,
    pipActive: false,
    togglePip: vi.fn(),
    fullscreen: false,
    toggleFullscreen: vi.fn(),
    getStats: vi.fn(() => ({})),
  };
}

function makeNav(): PlayerNav {
  return {
    revealed: true,
    zone: 'controls',
    overlay: null,
    controls: [],
    focusedControl: null,
    handleKey: vi.fn(),
    walkChrome: vi.fn(),
    poke: vi.fn(),
    rearmHide: vi.fn(),
    openOverlay: vi.fn(),
    closeOverlay: vi.fn(),
    activate: vi.fn(),
    focusControl: vi.fn(),
    focusProgress: vi.fn(),
    exit: vi.fn(),
  };
}

interface Params {
  nav: PlayerNav;
  controller: PlayerController;
  flags: typeof WEB_FLAGS;
  panelRef: { current: PanelHandle | null };
  locked: boolean;
  seekNudge: Mock<(dir: -1 | 1, press: SeekPress) => void>;
  setVolume: Mock<(level: number) => void>;
  intro?: { active: boolean; onSkip: () => void };
  credits?: { active: boolean; onKey: (key: string) => boolean };
}

const TV_BROWSER_FLAGS = { ...WEB_FLAGS, pointer: false };

function setup(over: Partial<Params> = {}) {
  const params: Params = {
    nav: makeNav(),
    controller: makeController(),
    flags: WEB_FLAGS,
    panelRef: { current: null },
    locked: false,
    seekNudge: vi.fn<(dir: -1 | 1, press: SeekPress) => void>(),
    setVolume: vi.fn<(level: number) => void>(),
    ...over,
  };
  const view = renderHook(() => usePlayerKeys(params));
  const press = (init: KeyboardEventInit) => {
    let notPrevented = true;
    act(() => {
      notPrevented = window.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
      );
    });
    return notPrevented;
  };
  return { ...view, params, press };
}

const undo: (() => void)[] = [];

function pressOn(target: EventTarget, init: KeyboardEventInit): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    );
  });
}

function heard(target: EventTarget): KeyboardEvent[] {
  const events: KeyboardEvent[] = [];
  const listener = (event: Event) => events.push(event as KeyboardEvent);
  target.addEventListener('keydown', listener);
  undo.push(() => target.removeEventListener('keydown', listener));
  return events;
}

afterEach(() => {
  for (const step of undo.splice(0)) step();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('usePlayerKeys letter/space transport shortcuts', () => {
  it('Space and "k" toggle play (and preventDefault the event)', () => {
    const { params, press } = setup();
    const prevented = press({ key: ' ', code: 'Space' });
    expect(params.controller.togglePlay).toHaveBeenCalledTimes(1);
    expect(params.nav.poke).toHaveBeenCalled();
    expect(prevented).toBe(false);
    press({ key: 'k' });
    expect(params.controller.togglePlay).toHaveBeenCalledTimes(2);
  });

  it('"f" toggles fullscreen only when the fullscreen flag is on', () => {
    const on = setup({ flags: { volume: true, pip: true, fullscreen: true, pointer: true } });
    on.press({ key: 'f' });
    expect(on.params.controller.toggleFullscreen).toHaveBeenCalledTimes(1);

    const off = setup({ flags: { volume: true, pip: true, fullscreen: false, pointer: true } });
    off.press({ key: 'f' });
    expect(off.params.controller.toggleFullscreen).not.toHaveBeenCalled();
  });

  it('"m" mutes (volume flag), "j"/"l" nudge the seek back and forward', () => {
    const { params, press } = setup();
    press({ key: 'm' });
    expect(params.controller.toggleMute).toHaveBeenCalledTimes(1);
    press({ key: 'j' });
    expect(params.seekNudge).toHaveBeenCalledWith(-1, 'tap');
    press({ key: 'l' });
    expect(params.seekNudge).toHaveBeenCalledWith(1, 'tap');
    expect(params.controller.skip).not.toHaveBeenCalled();
  });
});

describe('usePlayerKeys D-pad routing (a browser TV shell, no pointer)', () => {
  it('routes an arrow key to nav.handleKey when revealed with no panel', () => {
    const { params, press } = setup({ flags: TV_BROWSER_FLAGS });
    press({ key: 'ArrowRight' });
    expect(params.nav.handleKey).toHaveBeenCalledWith('Right');
    expect(params.seekNudge).not.toHaveBeenCalled();
  });

  it('while hidden the first arrow only pokes (does not route)', () => {
    const nav = makeNav();
    nav.revealed = false;
    const { press, params } = setup({ nav, flags: TV_BROWSER_FLAGS });
    press({ key: 'ArrowRight' });
    expect(nav.poke).toHaveBeenCalledTimes(1);
    expect(nav.handleKey).not.toHaveBeenCalled();
    expect(params.seekNudge).not.toHaveBeenCalled();
  });

  it('an open panel gets first refusal; a consumed key stops before nav', () => {
    const nav = makeNav();
    nav.overlay = 'settings';
    const onKey = vi.fn(() => true);
    const { press } = setup({ nav, panelRef: { current: { onKey } } });
    press({ key: 'ArrowDown' });
    expect(onKey).toHaveBeenCalledWith('Down');
    expect(nav.handleKey).not.toHaveBeenCalled();
  });

  it('a panel that declines the key lets nav handle it (Back closes the panel)', () => {
    const nav = makeNav();
    nav.overlay = 'settings';
    const onKey = vi.fn(() => false);
    const { press } = setup({ nav, panelRef: { current: { onKey } } });
    press({ key: 'Escape' });
    expect(onKey).toHaveBeenCalledWith('Back');
    expect(nav.handleKey).toHaveBeenCalledWith('Back');
  });
});

describe('usePlayerKeys owns the keys it takes', () => {
  it('stops a routed key before a listener behind the player sees it', () => {
    const { params } = setup({ flags: TV_BROWSER_FLAGS });
    const behind = heard(document);

    pressOn(document.body, { key: 'ArrowRight' });

    expect(params.nav.handleKey).toHaveBeenCalledWith('Right');
    expect(behind).toEqual([]);
  });

  it('leaves the keys typed in a field to the field', () => {
    const { params } = setup();
    const field = document.body.appendChild(document.createElement('input'));

    pressOn(field, { key: ' ', code: 'Space' });
    pressOn(field, { key: 'ArrowRight' });

    expect(params.controller.togglePlay).not.toHaveBeenCalled();
    expect(params.seekNudge).not.toHaveBeenCalled();
  });

  it('leaves a chord with a modifier to the browser', () => {
    const { params, press } = setup();

    const notPrevented = press({ key: ' ', code: 'Space', ctrlKey: true });
    press({ key: 'ArrowRight', altKey: true });

    expect(notPrevented).toBe(true);
    expect(params.controller.togglePlay).not.toHaveBeenCalled();
    expect(params.seekNudge).not.toHaveBeenCalled();
  });
});

describe('usePlayerKeys locked / intro / credits gates', () => {
  it('when locked only Back/OK leave the player; arrows are ignored', () => {
    const nav = makeNav();
    const { press } = setup({ nav, locked: true });
    press({ key: 'ArrowRight' });
    expect(nav.exit).not.toHaveBeenCalled();
    press({ key: 'Enter' });
    expect(nav.exit).toHaveBeenCalledWith('back');
  });

  it('the skip-intro affordance consumes OK', () => {
    const nav = makeNav();
    const onSkip = vi.fn();
    const { press } = setup({ nav, intro: { active: true, onSkip } });
    press({ key: 'Enter' });
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(nav.handleKey).not.toHaveBeenCalled();
  });

  it('the credits card consumes keys it claims, else nav handles them', () => {
    const nav = makeNav();
    const onKey = vi.fn((k: string) => k === 'Left');
    const { press } = setup({ nav, credits: { active: true, onKey } });
    press({ key: 'ArrowLeft' });
    expect(onKey).toHaveBeenCalledWith('Left');
    expect(nav.handleKey).not.toHaveBeenCalled();
    press({ key: 'ArrowRight' });
    expect(nav.handleKey).toHaveBeenCalledWith('Right');
  });
});

describe('usePlayerKeys arrow seek', () => {
  it('ArrowLeft/Right nudge the seek where a pointer drives the chrome, and keep it revealed', () => {
    const { params, press } = setup();
    const prevented = press({ key: 'ArrowLeft' });
    expect(params.seekNudge).toHaveBeenCalledWith(-1, 'tap');
    expect(params.nav.poke).toHaveBeenCalled();
    expect(params.nav.handleKey).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
    press({ key: 'ArrowRight' });
    expect(params.seekNudge).toHaveBeenCalledWith(1, 'tap');
  });

  it('a hidden chrome out of fullscreen comes back with the seek', () => {
    const nav = makeNav();
    nav.revealed = false;
    const { params, press } = setup({ nav });
    press({ key: 'ArrowRight' });
    expect(params.seekNudge).toHaveBeenCalledWith(1, 'tap');
    expect(nav.poke).toHaveBeenCalled();
    expect(nav.rearmHide).not.toHaveBeenCalled();
  });

  it('in immersive mode (fullscreen + hidden) the chrome stays dark', () => {
    const nav = makeNav();
    nav.revealed = false;
    const controller = makeController();
    controller.fullscreen = true;
    const { params, press } = setup({ nav, controller });
    press({ key: 'ArrowLeft' });
    expect(params.seekNudge).toHaveBeenCalledWith(-1, 'tap');
    expect(nav.rearmHide).toHaveBeenCalled();
    expect(nav.poke).not.toHaveBeenCalled();
    expect(nav.handleKey).not.toHaveBeenCalled();
  });

  it('a browser TV shell only gets the seek in immersive mode', () => {
    const nav = makeNav();
    nav.revealed = false;
    const controller = makeController();
    controller.fullscreen = true;
    const { params, press } = setup({ nav, controller, flags: TV_BROWSER_FLAGS });
    press({ key: 'ArrowRight' });
    expect(params.seekNudge).toHaveBeenCalledWith(1, 'tap');
    expect(nav.rearmHide).toHaveBeenCalled();
  });

  it('marks auto-repeat as a hold, so only a held key ramps into a scrub', () => {
    const { params, press } = setup();

    press({ key: 'ArrowRight', repeat: true });
    press({ key: 'l', repeat: true });

    expect(params.seekNudge.mock.calls).toEqual([
      [1, 'hold'],
      [1, 'hold'],
    ]);
  });

  it('an open panel keeps the arrows for itself', () => {
    const nav = makeNav();
    nav.overlay = 'settings';
    const onKey = vi.fn(() => true);
    const { params, press } = setup({ nav, panelRef: { current: { onKey } } });
    press({ key: 'ArrowRight' });
    expect(params.seekNudge).not.toHaveBeenCalled();
    expect(onKey).toHaveBeenCalledWith('Right');
  });
});

describe('usePlayerKeys arrow volume', () => {
  it('ArrowUp/Down step the level by 5% through the root, up to the controller ceiling', () => {
    const controller = makeController();
    controller.volume = 0.5;
    const { params, press } = setup({ controller });
    press({ key: 'ArrowUp' });
    expect(params.setVolume).toHaveBeenCalledWith(0.55);
    expect(params.controller.setVolume).not.toHaveBeenCalled();
    controller.volume = 1;
    press({ key: 'ArrowUp' });
    expect(params.setVolume).toHaveBeenLastCalledWith(1);
    controller.volumeMax = 2;
    press({ key: 'ArrowUp' });
    expect(params.setVolume).toHaveBeenLastCalledWith(1.05);
  });

  it('keeps the chrome dark in immersive mode (rearmHide, not poke)', () => {
    const nav = makeNav();
    nav.revealed = false;
    const controller = makeController();
    controller.fullscreen = true;
    controller.volume = 0.5;
    const { params, press } = setup({ nav, controller });
    press({ key: 'ArrowUp' });
    expect(params.setVolume).toHaveBeenCalled();
    expect(nav.rearmHide).toHaveBeenCalled();
    expect(nav.poke).not.toHaveBeenCalled();
    expect(params.seekNudge).not.toHaveBeenCalled();
  });
});

describe('usePlayerKeys listener lifecycle', () => {
  it('removes the window listener on unmount', () => {
    const { params, press, unmount } = setup();
    unmount();
    press({ key: 'ArrowRight' });
    expect(params.nav.handleKey).not.toHaveBeenCalled();
  });
});

describe('usePlayerKeys Tab', () => {
  it('walks the chrome in reading order, and backwards with Shift', () => {
    const { params, press } = setup();
    expect(press({ key: 'Tab' })).toBe(false);
    expect(params.nav.walkChrome).toHaveBeenCalledWith(false);
    press({ key: 'Tab', shiftKey: true });
    expect(params.nav.walkChrome).toHaveBeenCalledWith(true);
  });

  it('walks a settings list downwards, since a list is a column', () => {
    const nav = makeNav();
    const panel: PanelHandle = { onKey: vi.fn(() => true) };
    const { press } = setup({
      nav: { ...nav, overlay: 'settings' },
      panelRef: { current: panel },
    });
    press({ key: 'Tab' });
    expect(panel.onKey).toHaveBeenCalledWith('Down');
  });

  it('is ignored while the chrome is locked', () => {
    const nav = makeNav();
    const { press } = setup({ nav, locked: true });
    press({ key: 'Tab' });
    expect(nav.walkChrome).not.toHaveBeenCalled();
    expect(nav.handleKey).not.toHaveBeenCalled();
  });
});
