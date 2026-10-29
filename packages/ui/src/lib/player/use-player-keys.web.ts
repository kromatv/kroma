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
} from '#ui/components/organisms/player/lib/player-keys';
import type { PlayerController, PlayerFlags } from '#ui/components/organisms/player/types';
import { holdsCaret } from '#ui/lib/dom';
import { useFocusServices } from '#ui/lib/focus-services-context';
import { type RemoteKey, resolveRemoteKey } from '#ui/lib/remote-keys';
import type { PlayerNav } from '#ui/components/organisms/player/hooks/use-player-nav';

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
// ramps (see useSeekNudge). Where the flags ask for it (the web client), the
// arrows are always a seek: hovering moves the focus and Tab walks the row, so
// the D-pad never needs them. The 10-foot app keeps them for walking the
// controls, and only gets the seek in immersive mode (fullscreen + chrome hidden).
function arrowSeekShortcut(e: KeyboardEvent, p: Readonly<PlayerKeysParams>): boolean {
  const { nav, controller, flags } = p;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
  if (nav.overlay || p.credits?.active || p.resume?.active || p.postPlay?.active) return false;
  const immersive = flags.fullscreen && controller.fullscreen && !nav.revealed;
  if (!flags.arrowSeek && !immersive) return false;
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

const WALKED: ReadonlySet<RemoteKey> = new Set(['Up', 'Down', 'Left', 'Right', 'Enter']);

/** The single window keydown router. One stable listener always sees the latest
 * render, so re-renders never re-subscribe. It listens in the capture phase and
 * stops every press it routes, so the navigator and the screen behind the player
 * never act on the same press; the directions and OK it leaves to the navigator. A field holding the caret keeps its
 * keys, and a chord with Meta, Control or Alt stays the browser's. */
export function usePlayerKeys(params: Readonly<PlayerKeysParams>): void {
  const {
    mirror: { redeliverKey },
  } = useFocusServices();
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (belongsElsewhere(e)) return;
    if (params.locked) {
      lockedKey(e, params);
      return;
    }

    if (!params.postPlay?.active && letterShortcut(e, params)) return;
    if (arrowSeekShortcut(e, params)) return;
    if (arrowVolumeShortcut(e, params)) return;

    const remote = resolveRemoteKey(e);
    if (!remote || WALKED.has(remote)) return;
    takeKey(e);
    routeRemoteKey(params, remote);
  });

  const active = params.active !== false;
  useEffect(() => {
    if (!active) return;
    window.addEventListener('keydown', redeliverKey, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', redeliverKey, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [redeliverKey, active]);
}

export type { PlayerKeysParams };
