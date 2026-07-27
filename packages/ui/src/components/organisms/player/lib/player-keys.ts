// The player's key routing, in logical remote keys.
//
// This is the half of `usePlayerKeys` that has no platform in it: given a
// resolved {@link RemoteKey}, decide who gets it. The two platform hooks
// (`usePlayerKeys.web.ts` listens to DOM keydown, `usePlayerKeys.ts` listens to
// the TV remote) differ only in where the key comes FROM, so the order of
// refusal - lock, panel, skip-intro, credits, nav - is written once, here.

import type { RemoteKey } from '@kroma/core';
import type { RefObject } from 'react';
import type { PlayerNav } from '../hooks/usePlayerNav';
import type { PlayerController, PlayerFlags } from '../types';
import type { PanelHandle } from './nav';

export interface PlayerKeysParams {
  nav: PlayerNav;
  controller: PlayerController;
  flags: PlayerFlags;
  /** The currently-open panel (settings / sheet); keys route here first. */
  panelRef: RefObject<PanelHandle | null>;
  locked: boolean;
  /** Skip-intro affordance: OK skips while it is showing (§13). */
  intro?: { active: boolean; onSkip: () => void };
  /** Credits autoplay card: it handles its own OK / Back / left-right (§11). */
  credits?: { active: boolean; onKey: (key: RemoteKey) => boolean };
}

/**
 * Route one logical remote key (§3, §15).
 *
 * While the player is locked (admin-stop overlay) only Back / OK get through,
 * and both mean "dismiss". Otherwise the chrome reveals first - a key pressed
 * against hidden chrome only brings it back and is then swallowed (§16) - and
 * the open panel, the skip-intro button and the credits card each get first
 * refusal before the nav machine sees it.
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
