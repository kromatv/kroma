// Which way Tab walks from where the player is.
//
// The chrome is NOT on the spatial navigator - it cannot be, since tvOS's own
// focus engine would adopt it in parallel with this machine - so a keyboard's
// Tab reaches it the same way a remote does: as a direction. What decides the
// direction is the SHAPE of the thing being walked, and getting that wrong
// gives a keyboard user a Tab key that walks across a column or down a row.

import { describe, expect, it, vi } from 'vitest';
import type { PlayerNav } from '#ui/components/organisms/player/hooks/use-player-nav';
import { type PlayerKeysParams, routeRemoteKey, tabDirection } from './player-keys';

const nav = (over: Partial<PlayerNav>): PlayerNav => over as PlayerNav;

describe('tabDirection', () => {
  // The transport controls are a row, and so is the up-next sheet's grid.
  it.each([
    ['the transport controls', { overlay: null, zone: 'controls' }],
    ['the up-next sheet', { overlay: 'sheet', zone: 'controls' }],
    ['the up-next sheet, whatever zone is under it', { overlay: 'sheet', zone: 'seek' }],
  ])('walks along %s', (_label, over) => {
    expect(tabDirection(nav(over as Partial<PlayerNav>), false)).toBe('Right');
    expect(tabDirection(nav(over as Partial<PlayerNav>), true)).toBe('Left');
  });

  // Everything else is a column: the settings panel's rows, the seek bar's
  // stack, and the chrome above them.
  it.each([
    ['the seek bar', { overlay: null, zone: 'seek' }],
    ['the top chrome', { overlay: null, zone: 'top' }],
    ['a panel over the player', { overlay: 'panel', zone: 'controls' }],
  ])('walks down %s', (_label, over) => {
    expect(tabDirection(nav(over as Partial<PlayerNav>), false)).toBe('Down');
    expect(tabDirection(nav(over as Partial<PlayerNav>), true)).toBe('Up');
  });
});

describe('routeRemoteKey while locked', () => {
  function locked() {
    const handleKey = vi.fn();
    const poke = vi.fn();
    const params = {
      nav: nav({ handleKey, poke, revealed: true, overlay: null }),
      panelRef: { current: null },
      locked: true,
    } as unknown as PlayerKeysParams;
    return { params, handleKey, poke };
  }

  it.each<[string, 'Back' | 'Enter']>([
    ['Back', 'Back'],
    ['OK', 'Enter'],
  ])('lets %s through as a dismissal', (_label, key) => {
    const { params, handleKey } = locked();
    routeRemoteKey(params, key);
    expect(handleKey).toHaveBeenCalledWith('Back');
  });

  it('swallows every other key, chrome included', () => {
    const { params, handleKey, poke } = locked();
    for (const key of ['Right', 'Down', 'PlayPause'] as const) routeRemoteKey(params, key);
    expect(handleKey).not.toHaveBeenCalled();
    expect(poke).not.toHaveBeenCalled();
  });
});
