/// <reference path="../../../../lib/types/react-native-tv.d.ts" />
// Native key source: the Apple TV / Android TV remote. Read directly (not via
// OS focus, see usePlayerNav) because `window` is UNDEFINED in React Native,
// unlike the web half which listens on it.

import type { RemoteKey } from '@kroma/core';
import { useEffect, useEffectEvent } from 'react';
import { BackHandler, type HWEvent, Platform, useTVEventHandler } from 'react-native';
import {
  type PlayerKeysParams,
  routeRemoteKey,
} from '#ui/components/organisms/player/lib/player-keys';
import { useRemoteKeys } from '#ui/lib/focus-remote';
import { holdMenuKey, isRemoteKeyUp, releaseMenuKey } from '#ui/lib/tv-remote';

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
  // focus-nav). Android TV's Back is KEYCODE_BACK, which never reaches this
  // stream - it arrives through BackHandler instead (see below).
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
 * (same routing, different source: Metro picks this file, Vite the `.web` one).
 * No `preventDefault`: a claimed TV event has no default to suppress.
 */
export function usePlayerKeys(params: Readonly<PlayerKeysParams>): void {
  // Claim Menu while mounted: unclaimed, tvOS treats it as "leave the app"
  // instead of closing the player. A shared counter, since the screen
  // underneath also claims it.
  useEffect(() => {
    holdMenuKey();
    return releaseMenuKey;
  }, []);

  const onRemote = useEffectEvent((evt: HWEvent) => {
    if (isRemoteKeyUp(evt)) return;
    const key = REMOTE_KEYS[evt.eventType];
    // focus/blur/pan and the long-press variants land here; ignoring them is the
    // whole point of an explicit map.
    if (key) routeRemoteKey(params, key);
  });
  useRemoteEvents(onRemote);
  // Android's new architecture never fires `useRemoteEvents`; there the focus
  // root's key host feeds the d-pad in through here instead (see focus-remote).
  useRemoteKeys((key) => routeRemoteKey(params, key));

  // Android TV routes Back through BackHandler, not the TV event stream, so the
  // player has to claim it here or Android finishes the activity and quits the
  // app. Returning true keeps the press inside the player (mirrors focus-nav).
  //
  // Android TV and nothing else. NOT `Platform.isTV` alone: on tvOS this fork
  // implements BackHandler *on top of* the same `menu` event REMOTE_KEYS already
  // maps to Back, so a claim there routes one press twice. NOT `OS` alone
  // either: on a phone the back button belongs to the navigator.
  const onBack = useEffectEvent(() => routeRemoteKey(params, 'Back'));
  useEffect(() => {
    if (Platform.OS !== 'android' || !Platform.isTV) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, []);
}

export type { PlayerKeysParams };
