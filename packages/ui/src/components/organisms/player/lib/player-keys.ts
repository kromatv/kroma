// The platform-free half of `usePlayerKeys`: given a resolved RemoteKey, decide
// who gets it. Both platform hooks differ only in where the key comes from.

import type { RefObject } from 'react';
import type { PlayerNav } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { SeekPress } from '#ui/components/organisms/player/hooks/use-seek-nudge';
import type { PlayerController, PlayerFlags } from '#ui/components/organisms/player/types';
import type { RemoteKey } from '#ui/lib/remote-keys';
import type { PanelHandle } from './nav';

export interface PlayerKeysParams {
  active?: boolean;
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
  /** The over-film cards and the end screen: each is the navigator's while it
   *  is up, and Back is the one key the player still answers for it. */
  resume?: { active: boolean; onBack: () => void };
  credits?: { active: boolean; onBack: () => void };
  postPlay?: { active: boolean; onBack: () => void };
}

/**
 * Route one logical remote key (§3, §15) that the navigator does not walk:
 * directions and OK move and press the focused control like on any screen, so
 * only Back and the media keys reach here. While locked only Back and OK get
 * through, and both mean "dismiss". Back goes to whatever is in front: the end
 * screen, an open panel (which may step back inside itself first), the resume
 * card, the credits card, and only then the chrome.
 */
export function routeRemoteKey(p: Readonly<PlayerKeysParams>, key: RemoteKey): void {
  const { nav } = p;
  if (p.locked) {
    if (key === 'Back' || key === 'Enter') nav.exit('back');
    return;
  }
  if (p.postPlay?.active) {
    if (key === 'Back') p.postPlay.onBack();
    return;
  }
  if (key !== 'Back') {
    nav.handleKey(key);
    return;
  }
  if (nav.overlay) {
    if (p.panelRef.current?.onKey(key)) return;
    nav.handleKey(key);
    return;
  }
  if (p.resume?.active) {
    p.resume.onBack();
    return;
  }
  if (p.credits?.active) {
    p.credits.onBack();
    return;
  }
  nav.handleKey(key);
}
