import { describe, expect, it, vi } from 'vitest';
import type { PlayerNav } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { RemoteKey } from '#ui/lib/remote-keys';
import type { PanelHandle } from './nav';
import { type PlayerKeysParams, routeRemoteKey } from './player-keys';

interface Setup {
  locked?: boolean;
  overlay?: PlayerNav['overlay'];
  panel?: PanelHandle | null;
  resume?: boolean;
  credits?: boolean;
  postPlay?: boolean;
}

function route(setup: Setup = {}) {
  const handleKey = vi.fn();
  const exit = vi.fn();
  const card = (active: boolean | undefined) =>
    active === undefined ? undefined : { active, onBack: vi.fn() };
  const params = {
    nav: {
      handleKey,
      exit,
      revealed: true,
      overlay: setup.overlay ?? null,
    } as unknown as PlayerNav,
    panelRef: { current: setup.panel ?? null },
    locked: setup.locked ?? false,
    resume: card(setup.resume),
    credits: card(setup.credits),
    postPlay: card(setup.postPlay),
  } as unknown as PlayerKeysParams;
  const press = (key: RemoteKey) => routeRemoteKey(params, key);
  return { params, press, handleKey, exit };
}

describe('routeRemoteKey while locked', () => {
  it.each<[string, 'Back' | 'Enter']>([
    ['Back', 'Back'],
    ['OK', 'Enter'],
  ])('leaves the player on %s', (_label, key) => {
    const { press, exit, handleKey } = route({ locked: true });

    press(key);

    expect(exit).toHaveBeenCalledWith('back');
    expect(handleKey).not.toHaveBeenCalled();
  });

  it('swallows every other key', () => {
    const { press, handleKey, exit } = route({ locked: true });

    for (const key of ['Right', 'Down', 'PlayPause'] as const) press(key);

    expect(handleKey).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe('routeRemoteKey once the film is over', () => {
  it('hands Back to the end screen rather than the chrome', () => {
    const { params, press, handleKey } = route({ postPlay: true, credits: true });

    press('Back');

    expect(params.postPlay?.onBack).toHaveBeenCalledOnce();
    expect(params.credits?.onBack).not.toHaveBeenCalled();
    expect(handleKey).not.toHaveBeenCalled();
  });

  it('keeps the media keys away from a film that has ended', () => {
    const { press, handleKey } = route({ postPlay: true });

    press('PlayPause');

    expect(handleKey).not.toHaveBeenCalled();
  });
});

describe('routeRemoteKey with a panel open', () => {
  it('lets the panel take Back first', () => {
    const panel = { onKey: vi.fn(() => true) };
    const { press, handleKey } = route({ overlay: 'settings', panel });

    press('Back');

    expect(panel.onKey).toHaveBeenCalledWith('Back');
    expect(handleKey).not.toHaveBeenCalled();
  });

  it('hands Back to the player when the panel lets it go', () => {
    const panel = { onKey: vi.fn(() => false) };
    const { press, handleKey } = route({ overlay: 'settings', panel });

    press('Back');

    expect(handleKey).toHaveBeenCalledWith('Back');
  });

  it('outranks a resume card behind it', () => {
    const { params, press, handleKey } = route({ overlay: 'audio', resume: true });

    press('Back');

    expect(handleKey).toHaveBeenCalledWith('Back');
    expect(params.resume?.onBack).not.toHaveBeenCalled();
  });
});

describe('routeRemoteKey over the cards', () => {
  it('dismisses the resume card on Back', () => {
    const { params, press, handleKey } = route({ resume: true, credits: true });

    press('Back');

    expect(params.resume?.onBack).toHaveBeenCalledOnce();
    expect(params.credits?.onBack).not.toHaveBeenCalled();
    expect(handleKey).not.toHaveBeenCalled();
  });

  it('dismisses the credits card on Back', () => {
    const { params, press, handleKey } = route({ credits: true });

    press('Back');

    expect(params.credits?.onBack).toHaveBeenCalledOnce();
    expect(handleKey).not.toHaveBeenCalled();
  });

  it('hands Back to the player once the card has gone', () => {
    const { params, press, handleKey } = route({ resume: false });

    press('Back');

    expect(params.resume?.onBack).not.toHaveBeenCalled();
    expect(handleKey).toHaveBeenCalledWith('Back');
  });

  it('lets the media keys reach the film past a card', () => {
    const { params, press, handleKey } = route({ resume: true });

    press('PlayPause');

    expect(handleKey).toHaveBeenCalledWith('PlayPause');
    expect(params.resume?.onBack).not.toHaveBeenCalled();
  });
});

describe('routeRemoteKey over the chrome', () => {
  it.each<RemoteKey>(['PlayPause', 'Rewind', 'FastForward', 'Stop', 'Back'])(
    'hands %s to the player',
    (key) => {
      const { press, handleKey } = route();

      press(key);

      expect(handleKey).toHaveBeenCalledWith(key);
    },
  );
});
