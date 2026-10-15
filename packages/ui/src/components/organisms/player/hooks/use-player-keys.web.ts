// Web / browser-TV key source: one window keydown listener. Tizen, webOS, the
// desktop shell and the browser all deliver the remote as keyboard events,
// normalized by `resolveRemoteKey` (@kromatv/core). The native counterpart is
// `usePlayerKeys.ts`; Vite resolves `.web` first, Metro takes the plain file.

import { useEffect, useEffectEvent } from 'react';
import type { SeekPress } from '#ui/components/organisms/player/hooks/use-seek-nudge';
import { volumeStep } from '#ui/components/organisms/player/lib/fmt';
import {
  type PlayerKeysParams,
  routeRemoteKey,
  routeTab,
} from '#ui/components/organisms/player/lib/player-keys';
import type { PlayerController, PlayerFlags } from '#ui/components/organisms/player/types';
import { holdsCaret } from '#ui/lib/dom';
import { redeliverKey } from '#ui/lib/focus-mirror';
import { resolveRemoteKey } from '#ui/lib/remote-keys';
import type { PlayerNav } from './use-player-nav';

function takeKey(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

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
    p.seekNudge(-1, pressOf(e));
    return true;
  }
  if (letter === 'l') {
    keepChrome(nav, controller, flags);
    p.seekNudge(1, pressOf(e));
    return true;
  }
  return false;
}

function pressOf(e: KeyboardEvent): SeekPress {
  return e.repeat ? 'hold' : 'tap';
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
  takeKey(e);
  keepChrome(nav, controller, flags);
  const dir = e.key === 'ArrowUp' ? 1 : -1;
  p.setVolume(volumeStep(controller.volume, dir, controller.volumeMax ?? 1));
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
  takeKey(e);
  keepChrome(nav, controller, flags);
  p.seekNudge(e.key === 'ArrowLeft' ? -1 : 1, pressOf(e));
  return true;
}

function belongsElsewhere(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  return e.target instanceof Element && holdsCaret(e.target);
}

function lockedKey(e: KeyboardEvent, p: Readonly<PlayerKeysParams>): void {
  const key = resolveRemoteKey(e);
  if (key !== 'Back' && key !== 'Enter') return;
  takeKey(e);
  routeRemoteKey(p, key);
}

function postPlayKey(e: KeyboardEvent, p: Readonly<PlayerKeysParams>): boolean {
  if (!p.postPlay?.active) return false;
  const tab = e.shiftKey ? 'Left' : 'Right';
  const key = e.key === 'Tab' ? tab : resolveRemoteKey(e);
  if (key) {
    takeKey(e);
    routeRemoteKey(p, key);
  }
  return true;
}

/** The single window keydown router. One stable listener always sees the latest
 * render, so re-renders never re-subscribe. It listens in the capture phase and
 * stops every press it routes, so the spatial navigator and the screen behind
 * the player never act on the same press. A field holding the caret keeps its
 * keys, and a chord with Meta, Control or Alt stays the browser's. */
export function usePlayerKeys(params: Readonly<PlayerKeysParams>): void {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (belongsElsewhere(e)) return;
    if (params.locked) {
      lockedKey(e, params);
      return;
    }

    // The end-of-film screen is a screen of its own: nothing is playing, so the
    // media shortcuts below have nothing to act on, and its two buttons are a
    // row Tab walks the way the remote does.
    if (postPlayKey(e, params)) return;

    // Tab walks the chrome, and never the browser's own tab order: the chrome
    // is the only focus this screen has, so a second one behind it would take
    // the keyboard somewhere the eye is not.
    if (e.key === 'Tab') {
      takeKey(e);
      routeTab(params, e.shiftKey);
      return;
    }

    if (letterShortcut(e, params)) return;
    if (arrowSeekShortcut(e, params)) return;
    if (arrowVolumeShortcut(e, params)) return;

    const remote = resolveRemoteKey(e);
    if (!remote) return;
    takeKey(e);
    routeRemoteKey(params, remote);
  });

  useEffect(() => {
    window.addEventListener('keydown', redeliverKey, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', redeliverKey, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}

export type { PlayerKeysParams };
