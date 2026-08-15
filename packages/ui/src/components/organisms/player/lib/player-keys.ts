// The platform-free half of `usePlayerKeys`: given a resolved RemoteKey, decide
// who gets it. Both platform hooks differ only in where the key comes from.

import type { RemoteKey } from '@kroma/core';
import type { RefObject } from 'react';
import type { PlayerNav } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { PlayerController, PlayerFlags } from '#ui/components/organisms/player/types';
import type { PanelHandle } from './nav';

export interface PlayerKeysParams {
  nav: PlayerNav;
  controller: PlayerController;
  flags: PlayerFlags;
  panelRef: RefObject<PanelHandle | null>;
  locked: boolean;
  intro?: { active: boolean; onSkip: () => void };
  credits?: { active: boolean; onKey: (key: RemoteKey) => boolean };
}

/**
 * Which way Tab walks from where the player currently is.
 *
 * The chrome is NOT on the spatial navigator - it cannot be, since tvOS's own
 * focus engine would adopt it in parallel with this machine (see
 * lib/virtual-focus) - so a keyboard's Tab reaches it the same way a remote
 * does: as a direction. Along the thing being walked, which is a row for the
 * transport controls and the up-next grid, and a column for everything else.
 */
export function tabDirection(nav: PlayerNav, backwards: boolean): RemoteKey {
  const row = nav.overlay === 'sheet' || (!nav.overlay && nav.zone === 'controls');
  if (row) return backwards ? 'Left' : 'Right';
  return backwards ? 'Up' : 'Down';
}

/**
 * Route one logical remote key (§3, §15). While locked only Back / OK get
 * through, and both mean "dismiss". Otherwise the chrome reveals first and
 * swallows the key (§16), then the panel, skip-intro and credits card each get
 * first refusal before the nav machine sees it.
 */
export function routeRemoteKey(p: Readonly<PlayerKeysParams>, key: RemoteKey): void {
  const { nav } = p;
  if (p.locked) {
    if (key === 'Back' || key === 'Enter') nav.handleKey('Back');
    return;
  }

  if (!nav.revealed) {
    nav.poke();
    return;
  }
  nav.poke();

  if (nav.overlay) {
    if (p.panelRef.current?.onKey(key)) return;
    nav.handleKey(key); // an unhandled Back closes the panel
    return;
  }
  if (p.intro?.active && key === 'Enter') {
    p.intro.onSkip();
    return;
  }
  if (p.credits?.active && p.credits.onKey(key)) return;
  nav.handleKey(key);
}
