// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelHandle } from '../lib/nav';
import type { PlayerController } from '../types';
import { WEB_FLAGS } from '../types';
import { usePlayerKeys } from './use-player-keys';
import type { PlayerNav } from './use-player-nav';

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
    poke: vi.fn(),
    openOverlay: vi.fn(),
    closeOverlay: vi.fn(),
    activate: vi.fn(),
    focusControl: vi.fn(),
    focusProgress: vi.fn(),
  };
}

interface Params {
  nav: PlayerNav;
  controller: PlayerController;
  flags: typeof WEB_FLAGS;
  panelRef: { current: PanelHandle | null };
  locked: boolean;
  intro?: { active: boolean; onSkip: () => void };
  credits?: { active: boolean; onKey: (key: string) => boolean };
}

function setup(over: Partial<Params> = {}) {
  const params: Params = {
    nav: makeNav(),
    controller: makeController(),
    flags: WEB_FLAGS,
    panelRef: { current: null },
    locked: false,
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

afterEach(() => vi.restoreAllMocks());

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

  it('"m" mutes (volume flag), "j"/"l" seek ∓10s', () => {
    const { params, press } = setup();
    press({ key: 'm' });
    expect(params.controller.toggleMute).toHaveBeenCalledTimes(1);
    press({ key: 'j' });
    expect(params.controller.skip).toHaveBeenCalledWith(-10);
    press({ key: 'l' });
    expect(params.controller.skip).toHaveBeenCalledWith(10);
  });
});

describe('usePlayerKeys D-pad routing', () => {
  it('routes an arrow key to nav.handleKey when revealed with no panel', () => {
    const { params, press } = setup();
    press({ key: 'ArrowRight' });
    expect(params.nav.handleKey).toHaveBeenCalledWith('Right');
  });

  it('while hidden the first arrow only pokes (does not route)', () => {
    const nav = makeNav();
    nav.revealed = false;
    const { press } = setup({ nav });
    press({ key: 'ArrowRight' });
    expect(nav.poke).toHaveBeenCalledTimes(1);
    expect(nav.handleKey).not.toHaveBeenCalled();
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

describe('usePlayerKeys locked / intro / credits gates', () => {
  it('when locked only Back/OK dismiss (routed as Back); arrows are ignored', () => {
    const nav = makeNav();
    const { press } = setup({ nav, locked: true });
    press({ key: 'ArrowRight' });
    expect(nav.handleKey).not.toHaveBeenCalled();
    press({ key: 'Enter' });
    expect(nav.handleKey).toHaveBeenCalledWith('Back');
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

describe('usePlayerKeys listener lifecycle', () => {
  it('removes the window listener on unmount', () => {
    const { params, press, unmount } = setup();
    unmount();
    press({ key: 'ArrowRight' });
    expect(params.nav.handleKey).not.toHaveBeenCalled();
  });
});

describe('usePlayerKeys Tab', () => {
  it('walks the transport row sideways, and backwards with Shift', () => {
    const { params, press } = setup();
    expect(press({ key: 'Tab' })).toBe(false);
    expect(params.nav.handleKey).toHaveBeenCalledWith('Right');
    press({ key: 'Tab', shiftKey: true });
    expect(params.nav.handleKey).toHaveBeenCalledWith('Left');
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
    expect(nav.handleKey).not.toHaveBeenCalled();
  });
});
