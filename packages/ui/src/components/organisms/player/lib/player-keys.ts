// The platform-free half of `usePlayerKeys`: given a resolved RemoteKey, decide
// who gets it. Both platform hooks differ only in where the key comes from.

import type { RefObject } from 'react';
import type { PlayerNav } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { SeekPress } from '#ui/components/organisms/player/hooks/use-seek-nudge';
import type { PlayerController, PlayerFlags } from '#ui/components/organisms/player/types';
import type { RemoteKey } from '#ui/lib/remote-keys';
import type { PanelHandle } from './nav';
import { TRANSPORT_KEYS } from './nav-keys';

export interface PlayerKeysParams {
  nav: PlayerNav;
  controller: PlayerController;
  flags: PlayerFlags;
  panelRef: RefObject<PanelHandle | null>;
  locked: boolean;
  /** The keyboard's seek: arrows and j / l go through the nudge machine, so a
   *  held key ramps, a run of taps adds up and the stage can echo them. */
  seekNudge(dir: -1 | 1, press: SeekPress): void;
  /** The keyboard's volume: ArrowUp / Down land here so the stage can echo the
   *  level, rather than on the controller directly. */
  setVolume(level: number): void;
  intro?: { active: boolean; onSkip: () => void };
  /** The resumed-at prompt while it is up. It takes Back (the keyboard's Escape)
   *  and nothing else: unlike the skip pill it must not answer OK, or a film that
   *  opened where it was left would restart on a press of play. */
  resume?: { active: boolean; onDismiss: () => void };
  credits?: { active: boolean; onKey: (key: RemoteKey) => boolean };
  /** The end-of-film screen. While it is up there is no film left to drive, so
   *  it takes every key rather than getting first refusal on some. */
  postPlay?: { active: boolean; onKey: (key: RemoteKey) => void };
}

function overFilmKey(p: Readonly<PlayerKeysParams>, key: RemoteKey): boolean {
  if (p.resume?.active && key === 'Back') {
    p.resume.onDismiss();
    return true;
  }
  if (p.intro?.active && key === 'Enter') {
    p.intro.onSkip();
    return true;
  }
  return p.credits?.active === true && p.credits.onKey(key);
}

/**
 * Route one logical remote key (§3, §15). While locked only Back / OK get
 * through, and both mean "dismiss". The end-of-film screen takes everything.
 * Then the open panel, then the three things drawn over the film: the resume
 * prompt, the skip pill and the credits card. Only after those does a hidden
 * chrome reveal and swallow the key (§16), unless the key drives the film
 * itself, or is the Back that leaves.
 */
export function routeRemoteKey(p: Readonly<PlayerKeysParams>, key: RemoteKey): void {
  const { nav } = p;
  if (p.locked) {
    if (key === 'Back' || key === 'Enter') nav.exit('back');
    return;
  }
  if (p.postPlay?.active) {
    p.postPlay.onKey(key);
    return;
  }
  if (nav.overlay) {
    nav.poke();
    if (p.panelRef.current?.onKey(key)) return;
    nav.handleKey(key); // an unhandled Back closes the panel
    return;
  }

  if (overFilmKey(p, key)) return;
  if (key === 'Back' && !nav.revealed) {
    nav.handleKey(key);
    return;
  }
  if (!nav.revealed && !TRANSPORT_KEYS.has(key)) {
    nav.poke();
    return;
  }
  nav.poke();
  nav.handleKey(key);
}

/**
 * Tab and Shift+Tab, which only a keyboard has.
 *
 * The chrome is NOT on the spatial navigator (it cannot be, since tvOS's own
 * focus engine would adopt it in parallel with this machine, see
 * lib/virtual-focus), and no single direction reaches the back button, the seek
 * bar, every control and the sheet in turn.
 */
export function routeTab(p: Readonly<PlayerKeysParams>, backwards: boolean): void {
  const { nav } = p;
  if (nav.overlay) {
    const panel = p.panelRef.current;
    if (!panel?.onTab) {
      routeRemoteKey(p, backwards ? 'Up' : 'Down');
      return;
    }
    nav.poke();
    if (!panel.onTab(backwards)) nav.closeOverlay();
    return;
  }
  if (p.credits?.active) {
    routeRemoteKey(p, backwards ? 'Left' : 'Right');
    return;
  }
  if (!nav.revealed) {
    nav.poke();
    return;
  }
  nav.poke();
  nav.walkChrome(backwards);
}
