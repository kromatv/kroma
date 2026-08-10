// Which way Tab walks from where the player is.
//
// The chrome is NOT on the spatial navigator - it cannot be, since tvOS's own
// focus engine would adopt it in parallel with this machine - so a keyboard's
// Tab reaches it the same way a remote does: as a direction. What decides the
// direction is the SHAPE of the thing being walked, and getting that wrong
// gives a keyboard user a Tab key that walks across a column or down a row.

import { describe, expect, it } from 'vitest';
import type { PlayerNav } from '../hooks/usePlayerNav';
import { tabDirection } from './player-keys';

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
