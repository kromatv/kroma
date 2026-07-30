/// <reference path="../../../../lib/types/react-native-tv.d.ts" />
// Native key source: the Apple TV / Android TV remote. Read directly (not via
// OS focus, see usePlayerNav) because `window` is UNDEFINED in React Native,
// unlike the web half which listens on it.

import type { RemoteKey } from '@kroma/core';
import { useEffect, useRef } from 'react';
import { type HWEvent, useTVEventHandler } from 'react-native';
import { holdMenuKey, isRemoteKeyUp, releaseMenuKey } from '#ui/lib/tv-remote';
import { type PlayerKeysParams, routeRemoteKey } from '../lib/player-keys';

// Both the clickpad (up/down/left/right) and the touch-surface swipes
// (swipeUp/...) map here: different gesture recognizers that never both fire.
const REMOTE_KEYS: Record<string, RemoteKey> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  swipeUp: 'Up',
  swipeDown: 'Down',
  swipeLeft: 'Left',
  swipeRight: 'Right',
  select: 'Enter',
  // tvOS reports the Menu button as `menu` once the key is claimed (see
  // focus-nav); Android TV's remote sends `back`.
  menu: 'Back',
  back: 'Back',
  playPause: 'PlayPause',
  play: 'Play',
  pause: 'Pause',
  fastForward: 'FastForward',
  rewind: 'Rewind',
  stop: 'Stop',
  nextTrack: 'Next',
  previousTrack: 'Prev',
};

// Only exists in the react-native-tvos fork; on mainline RN (mobile) it's
// undefined, so this falls back to a no-op rather than changing hook count.
const useRemoteEvents: (handler: (event: HWEvent) => void) => void =
  typeof useTVEventHandler === 'function' ? useTVEventHandler : () => {};

/**
 * Route the TV remote into the player; the native mirror of `usePlayerKeys.web.ts`
 * (same routing, different source — Metro picks this file, Vite the `.web` one).
 * No `preventDefault`: a claimed TV event has no default to suppress.
 */
export function usePlayerKeys(params: Readonly<PlayerKeysParams>): void {
  const latest = useRef(params);
  latest.current = params;

  // Claim Menu while mounted — unclaimed, tvOS treats it as "leave the app"
  // instead of closing the player. A shared counter, since the screen
  // underneath also claims it.
  useEffect(() => {
    holdMenuKey();
    return releaseMenuKey;
  }, []);

  useRemoteEvents((evt: HWEvent) => {
    if (isRemoteKeyUp(evt)) return;
    const key = REMOTE_KEYS[evt.eventType];
    // focus/blur/pan and the long-press variants land here; ignoring them is the
    // whole point of an explicit map.
    if (key) routeRemoteKey(latest.current, key);
  });
}

export type { PlayerKeysParams };
