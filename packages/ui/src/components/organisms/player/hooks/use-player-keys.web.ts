// Web / browser-TV key source: one window keydown listener. Tizen, webOS, the
// desktop shell and the browser all deliver the remote as keyboard events,
// normalized by `resolveRemoteKey` (@kromatv/core). The native counterpart is
// `usePlayerKeys.ts`; Vite resolves `.web` first, Metro takes the plain file.

import { useEffect, useEffectEvent } from 'react';
import { volumeStep } from '#ui/components/organisms/player/lib/fmt';
import {
  type PlayerKeysParams,
  routeRemoteKey,
  tabDirection,
} from '#ui/components/organisms/player/lib/player-keys';
import type { PlayerController, PlayerFlags } from '#ui/components/organisms/player/types';
import { redeliverKey } from '#ui/lib/focus-mirror';
import { resolveRemoteKey } from '#ui/lib/remote-keys';
import type { PlayerNav } from './use-player-nav';

function letterShortcut(e: KeyboardEvent, p: Readonly<PlayerKeysParams>): boolean {
  const { nav, controller, flags } = p;
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
    keepChrome(nav, controller, flags);
    p.seekNudge(-1);
    return true;
  }
  if (letter === 'l') {
    keepChrome(nav, controller, flags);
    p.seekNudge(1);
    return true;
  }
  return false;
}

// In immersive mode (fullscreen + chrome hidden) a media shortcut keeps the UI
// dark, the stage echoing what happened instead; elsewhere it reveals the chrome.
function keepChrome(nav: PlayerNav, controller: PlayerController, flags: PlayerFlags): void {
  if (!nav.revealed && flags.fullscreen && controller.fullscreen) nav.rearmHide();
  else nav.poke();
}

// On the web (flags.volume = true), ArrowUp/Down adjust volume globally: no
// need to focus the volume control first. Skipped when a panel is open so
// D-pad navigation inside the panel still works.
function arrowVolumeShortcut(e: KeyboardEvent, p: Readonly<PlayerKeysParams>): boolean {
  const { nav, controller, flags } = p;
  if (!flags.volume || nav.overlay) return false;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
  e.preventDefault();
  keepChrome(nav, controller, flags);
  const dir = e.key === 'ArrowUp' ? 1 : -1;
  controller.setVolume(volumeStep(controller.volume, dir, controller.volumeMax ?? 1));
  return true;
}

// ArrowLeft/Right seek like YouTube's: a tap is 10 s, taps add up, a held key
// ramps (see useSeekNudge). Where a fine pointer drives the chrome, the arrows
// are always a seek: hovering moves the focus and Tab walks the row, so the
// D-pad never needs them. A browser TV shell keeps them for the D-pad, and only
// gets the seek in immersive mode (fullscreen + chrome hidden).
function arrowSeekShortcut(e: KeyboardEvent, p: Readonly<PlayerKeysParams>): boolean {
  const { nav, controller, flags } = p;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
  if (nav.overlay || p.credits?.active) return false;
  const immersive = flags.fullscreen && controller.fullscreen && !nav.revealed;
  if (!flags.pointer && !immersive) return false;
  e.preventDefault();
  keepChrome(nav, controller, flags);
  p.seekNudge(e.key === 'ArrowLeft' ? -1 : 1);
  return true;
}

/** The single window keydown router. One stable listener always sees the latest
 * render, so re-renders never re-subscribe. */
export function usePlayerKeys(params: Readonly<PlayerKeysParams>): void {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const { nav, locked } = params;
    if (locked) {
      const key = resolveRemoteKey(e);
      if (key === 'Back' || key === 'Enter') {
        e.preventDefault();
        routeRemoteKey(params, key);
      }
      return;
    }

    // The end-of-film screen is a screen of its own: nothing is playing, so the
    // media shortcuts below have nothing to act on, and its two buttons are a
    // row Tab walks the way the remote does.
    if (params.postPlay?.active) {
      const tab = e.shiftKey ? 'Left' : 'Right';
      const key = e.key === 'Tab' ? tab : resolveRemoteKey(e);
      if (!key) return;
      e.preventDefault();
      routeRemoteKey(params, key);
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

    if (letterShortcut(e, params)) return;
    if (arrowSeekShortcut(e, params)) return;
    if (arrowVolumeShortcut(e, params)) return;

    const remote = resolveRemoteKey(e);
    if (!remote) return;
    e.preventDefault();
    routeRemoteKey(params, remote);
  });

  useEffect(() => {
    window.addEventListener('keydown', redeliverKey, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', redeliverKey, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

export type { PlayerKeysParams };
