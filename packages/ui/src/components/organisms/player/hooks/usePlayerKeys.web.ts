// Web / browser-TV key source: one window keydown listener. Tizen, webOS, the
// desktop shell and the browser all deliver the remote as keyboard events,
// normalized by `resolveRemoteKey` (@kroma/core). The native counterpart is
// `usePlayerKeys.ts`; Vite resolves `.web` first, Metro takes the plain file.

import { resolveRemoteKey } from '@kroma/core';
import { useEffect, useRef } from 'react';
import { type PlayerKeysParams, routeRemoteKey, tabDirection } from '../lib/player-keys';
import type { PlayerController, PlayerFlags } from '../types';
import type { PlayerNav } from './usePlayerNav';

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

/** The single window keydown router. One stable listener calls the latest
 * closure, so re-renders never re-subscribe. */
export function usePlayerKeys(params: Readonly<PlayerKeysParams>): void {
  const latest = useRef<(e: KeyboardEvent) => void>(() => undefined);
  latest.current = (e: KeyboardEvent) => {
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

    const remote = resolveRemoteKey(e);
    if (!remote) return;
    e.preventDefault();
    routeRemoteKey(params, remote);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => latest.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export type { PlayerKeysParams };
