// Web / browser-TV key source: one window keydown listener. Tizen, webOS, the
// desktop shell and the browser all deliver the remote as keyboard events,
// normalized by `resolveRemoteKey` (@kroma/core). The native counterpart is
// `usePlayerKeys.ts`; Vite resolves `.web` first, Metro takes the plain file.

import { resolveRemoteKey } from '@kroma/core';
import { useEffect, useEffectEvent } from 'react';
import { VOLUME_MAX } from '#ui/components/organisms/player/lib/fmt';
import {
  type PlayerKeysParams,
  routeRemoteKey,
  tabDirection,
} from '#ui/components/organisms/player/lib/player-keys';
import type { PlayerController, PlayerFlags } from '#ui/components/organisms/player/types';
import type { PlayerNav } from './use-player-nav';

function letterShortcut(
  e: KeyboardEvent,
  nav: PlayerNav,
  controller: PlayerController,
  flags: PlayerFlags,
): boolean {
  const letter = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.code === 'Space' || letter === 'k') {
    e.preventDefault();
    nav.poke();
    controller.togglePlay();
    return true;
  }
  if (letter === 'f' && flags.fullscreen) {
    nav.poke();
    controller.toggleFullscreen();
    return true;
  }
  if (letter === 'm' && flags.volume) {
    nav.poke();
    controller.toggleMute();
    return true;
  }
  if (letter === 'j') {
    nav.poke();
    controller.skip(-10);
    return true;
  }
  if (letter === 'l') {
    nav.poke();
    controller.skip(10);
    return true;
  }
  return false;
}

// On the web (flags.volume = true), ArrowUp/Down adjust volume globally — no
// need to focus the volume control first. Skipped when a panel is open so
// D-pad navigation inside the panel still works. In immersive mode (fullscreen
// + chrome hidden), rearmHide keeps the UI dark instead of flashing it.
function arrowVolumeShortcut(
  e: KeyboardEvent,
  nav: PlayerNav,
  controller: PlayerController,
  flags: PlayerFlags,
): boolean {
  if (!flags.volume || nav.overlay) return false;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
  e.preventDefault();
  if (flags.fullscreen && controller.fullscreen && !nav.revealed) nav.rearmHide();
  else nav.poke();
  const dir = e.key === 'ArrowUp' ? 1 : -1;
  // Step 5% in real volume (not slider space), clamped to 0–VOLUME_MAX.
  const next = Math.max(0, Math.min(VOLUME_MAX, controller.volume + dir * 0.05));
  controller.setVolume(next);
  return true;
}

// Immersive mode: fullscreen + chrome hidden → ArrowLeft/Right seek ±10s, just
// like the j/l letter shortcuts. The chrome stays hidden (rearmHide re-arms the
// auto-hide timer without revealing). When the chrome is visible, arrows fall
// through to the nav machine for D-pad navigation instead.
const SEEK_STEP = 10;
function arrowSeekShortcut(
  e: KeyboardEvent,
  nav: PlayerNav,
  controller: PlayerController,
  flags: PlayerFlags,
): boolean {
  if (!flags.fullscreen || !controller.fullscreen) return false;
  if (nav.revealed || nav.overlay) return false;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
  e.preventDefault();
  nav.rearmHide();
  controller.skip(e.key === 'ArrowLeft' ? -SEEK_STEP : SEEK_STEP);
  return true;
}

/** The single window keydown router. One stable listener always sees the latest
 * render, so re-renders never re-subscribe. */
export function usePlayerKeys(params: Readonly<PlayerKeysParams>): void {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const { nav, controller, flags, locked } = params;
    if (locked) {
      const key = resolveRemoteKey(e);
      if (key === 'Back' || key === 'Enter') {
        e.preventDefault();
        routeRemoteKey(params, key);
      }
      return;
    }

    // Tab walks the chrome, and never the browser's own tab order: the chrome
    // is the only focus this screen has, so a second one behind it would take
    // the keyboard somewhere the eye is not.
    if (e.key === 'Tab') {
      e.preventDefault();
      routeRemoteKey(params, tabDirection(nav, e.shiftKey));
      return;
    }

    if (letterShortcut(e, nav, controller, flags)) return;

    // Immersive mode first: fullscreen + chrome hidden → arrows are media
    // shortcuts (seek/volume), not D-pad navigation.
    if (arrowSeekShortcut(e, nav, controller, flags)) return;
    if (arrowVolumeShortcut(e, nav, controller, flags)) return;

    const remote = resolveRemoteKey(e);
    if (!remote) return;
    e.preventDefault();
    routeRemoteKey(params, remote);
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export type { PlayerKeysParams };
