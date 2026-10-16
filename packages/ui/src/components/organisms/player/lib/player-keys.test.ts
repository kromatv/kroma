import { describe, expect, it, vi } from 'vitest';
import type { PlayerNav } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { RemoteKey } from '#ui/lib/remote-keys';
import { type PlayerKeysParams, routeRemoteKey, routeTab } from './player-keys';

const nav = (over: Partial<PlayerNav>): PlayerNav => over as PlayerNav;

describe('routeTab over the chrome', () => {
  function chrome(over: Partial<PlayerNav> = {}) {
    const walkChrome = vi.fn();
    const handleKey = vi.fn();
    const poke = vi.fn();
    const params = {
      nav: nav({ walkChrome, handleKey, poke, revealed: true, overlay: null, ...over }),
      panelRef: { current: null },
      locked: false,
    } as unknown as PlayerKeysParams;
    return { params, walkChrome, handleKey, poke };
  }

  it('walks the reading order rather than stepping a direction', () => {
    const { params, walkChrome, handleKey } = chrome();

    routeTab(params, false);
    routeTab(params, true);

    expect(walkChrome.mock.calls).toEqual([[false], [true]]);
    expect(handleKey).not.toHaveBeenCalled();
  });

  it('spends the first press waking a hidden chrome, as every other key does', () => {
    const { params, walkChrome, poke } = chrome({ revealed: false });

    routeTab(params, false);

    expect(walkChrome).not.toHaveBeenCalled();
    expect(poke).toHaveBeenCalledOnce();
  });
});

describe('routeTab inside a surface that took the keyboard', () => {
  function surface(over: Partial<PlayerKeysParams>, navOver: Partial<PlayerNav> = {}) {
    const onKey = vi.fn(() => true);
    const walkChrome = vi.fn();
    const params = {
      nav: nav({
        walkChrome,
        handleKey: vi.fn(),
        poke: vi.fn(),
        closeOverlay: vi.fn(),
        revealed: true,
        ...navOver,
      }),
      panelRef: { current: { onKey } },
      locked: false,
      ...over,
    } as unknown as PlayerKeysParams;
    return { params, onKey, walkChrome };
  }

  it('hands a grid the whole press, so a line can turn the corner', () => {
    const onTab = vi.fn(() => true);
    const closeOverlay = vi.fn();
    const { params } = surface({}, { overlay: 'sheet', closeOverlay });
    params.panelRef.current = { onKey: vi.fn(() => true), onTab };

    routeTab(params, false);
    routeTab(params, true);

    expect(onTab.mock.calls).toEqual([[false], [true]]);
    expect(closeOverlay).not.toHaveBeenCalled();
  });

  it('closes a grid that hands the press back, so the walk leaves it', () => {
    const closeOverlay = vi.fn();
    const { params } = surface({}, { overlay: 'sheet', closeOverlay });
    params.panelRef.current = { onKey: vi.fn(() => true), onTab: () => false };

    routeTab(params, true);

    expect(closeOverlay).toHaveBeenCalledOnce();
  });

  it('walks down a settings list, which is a column', () => {
    const { params, onKey } = surface({}, { overlay: 'settings' });

    routeTab(params, false);
    routeTab(params, true);

    expect(onKey.mock.calls).toEqual([['Down'], ['Up']]);
  });

  it('walks along the credits card, whose two buttons sit side by side', () => {
    const credits = { active: true, onKey: vi.fn(() => true) };
    const { params, walkChrome } = surface({ credits }, { overlay: null });

    routeTab(params, false);

    expect(credits.onKey).toHaveBeenCalledWith('Right');
    expect(walkChrome).not.toHaveBeenCalled();
  });
});

describe('routeRemoteKey while locked', () => {
  function locked() {
    const handleKey = vi.fn();
    const poke = vi.fn();
    const exit = vi.fn();
    const params = {
      nav: nav({ handleKey, poke, exit, revealed: true, overlay: null }),
      panelRef: { current: null },
      locked: true,
    } as unknown as PlayerKeysParams;
    return { params, handleKey, poke, exit };
  }

  it.each<[string, 'Back' | 'Enter']>([
    ['Back', 'Back'],
    ['OK', 'Enter'],
  ])('leaves the player on %s', (_label, key) => {
    const { params, exit, handleKey } = locked();

    routeRemoteKey(params, key);

    expect(exit).toHaveBeenCalledWith('back');
    expect(handleKey).not.toHaveBeenCalled();
  });

  it('swallows every other key, chrome included', () => {
    const { params, handleKey, poke, exit } = locked();
    for (const key of ['Right', 'Down', 'PlayPause'] as const) routeRemoteKey(params, key);
    expect(handleKey).not.toHaveBeenCalled();
    expect(poke).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe('routeRemoteKey once the film is over', () => {
  function over() {
    const handleKey = vi.fn();
    const poke = vi.fn();
    const onKey = vi.fn();
    const params = {
      nav: nav({ handleKey, poke, revealed: true, overlay: null }),
      panelRef: { current: null },
      locked: false,
      credits: { active: true, onKey: vi.fn(() => true) },
      postPlay: { active: true, onKey },
    } as unknown as PlayerKeysParams;
    return { params, handleKey, poke, onKey };
  }

  it('hands the end screen every key, and the chrome none of them', () => {
    const { params, handleKey, poke, onKey } = over();
    for (const key of ['Right', 'Enter', 'Back', 'PlayPause', 'Down'] as const) {
      routeRemoteKey(params, key);
    }
    expect(onKey).toHaveBeenCalledTimes(5);
    expect(handleKey).not.toHaveBeenCalled();
    expect(poke).not.toHaveBeenCalled();
  });

  it('outranks the credits card, which belongs to a film still running', () => {
    const { params, onKey } = over();
    routeRemoteKey(params, 'Enter');
    expect(params.credits?.onKey).not.toHaveBeenCalled();
    expect(onKey).toHaveBeenCalledWith('Enter');
  });
});

describe('routeRemoteKey while the resume prompt is up', () => {
  function prompted(active = true) {
    const handleKey = vi.fn();
    const onDismiss = vi.fn();
    const params = {
      nav: nav({ handleKey, poke: vi.fn(), revealed: true, overlay: null }),
      panelRef: { current: null },
      locked: false,
      resume: { active, onDismiss },
    } as unknown as PlayerKeysParams;
    return { params, handleKey, onDismiss };
  }

  it('takes Back for itself rather than letting the player close', () => {
    const { params, handleKey, onDismiss } = prompted();

    routeRemoteKey(params, 'Back');

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(handleKey).not.toHaveBeenCalled();
  });

  it('leaves OK alone, so a film that opened where it was left cannot restart', () => {
    const { params, handleKey, onDismiss } = prompted();

    routeRemoteKey(params, 'Enter');

    expect(onDismiss).not.toHaveBeenCalled();
    expect(handleKey).toHaveBeenCalledWith('Enter');
  });

  it('hands Back back to the player once it has gone', () => {
    const { params, handleKey, onDismiss } = prompted(false);

    routeRemoteKey(params, 'Back');

    expect(onDismiss).not.toHaveBeenCalled();
    expect(handleKey).toHaveBeenCalledWith('Back');
  });
});

describe('routeRemoteKey while the chrome is hidden', () => {
  function hidden() {
    const handleKey = vi.fn();
    const poke = vi.fn();
    const params = {
      nav: nav({ handleKey, poke, revealed: false, overlay: null }),
      panelRef: { current: null },
      locked: false,
    } as unknown as PlayerKeysParams;
    return { params, handleKey, poke };
  }

  it.each<[string, RemoteKey]>([
    ['play/pause', 'PlayPause'],
    ['play', 'Play'],
    ['pause', 'Pause'],
    ['rewind', 'Rewind'],
    ['fast forward', 'FastForward'],
    ['stop', 'Stop'],
  ])('drives the film on %s, with no press spent waking the chrome', (_label, key) => {
    const { params, handleKey } = hidden();

    routeRemoteKey(params, key);

    expect(handleKey).toHaveBeenCalledWith(key);
  });

  it('spends a d-pad press on revealing the chrome instead', () => {
    const { params, handleKey, poke } = hidden();

    routeRemoteKey(params, 'Right');

    expect(handleKey).not.toHaveBeenCalled();
    expect(poke).toHaveBeenCalledOnce();
  });

  it('hands Back straight to the player rather than bringing the chrome back', () => {
    const { params, handleKey, poke } = hidden();

    routeRemoteKey(params, 'Back');

    expect(handleKey).toHaveBeenCalledWith('Back');
    expect(poke).not.toHaveBeenCalled();
  });
});

describe('routeRemoteKey while the skip pill is up', () => {
  function pilled(revealed: boolean) {
    const handleKey = vi.fn();
    const onSkip = vi.fn();
    const params = {
      nav: nav({ handleKey, poke: vi.fn(), revealed, overlay: null }),
      panelRef: { current: null },
      locked: false,
      intro: { active: true, onSkip },
    } as unknown as PlayerKeysParams;
    return { params, handleKey, onSkip };
  }

  it.each([true, false])('skips the intro on OK with the chrome shown: %s', (revealed) => {
    const { params, handleKey, onSkip } = pilled(revealed);

    routeRemoteKey(params, 'Enter');

    expect(onSkip).toHaveBeenCalledOnce();
    expect(handleKey).not.toHaveBeenCalled();
  });
});

describe('routeRemoteKey while the credits card counts down', () => {
  it('moves along the card with the chrome away, rather than waking it', () => {
    const onKey = vi.fn(() => true);
    const handleKey = vi.fn();
    const params = {
      nav: nav({ handleKey, poke: vi.fn(), revealed: false, overlay: null }),
      panelRef: { current: null },
      locked: false,
      credits: { active: true, onKey },
    } as unknown as PlayerKeysParams;

    routeRemoteKey(params, 'Right');

    expect(onKey).toHaveBeenCalledWith('Right');
    expect(handleKey).not.toHaveBeenCalled();
  });
});
