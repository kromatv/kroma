/// <reference path="../../../../lib/types/react-native-tv.d.ts" />
// Native key source: the Apple TV / Android TV remote.
//
// The player is the one screen that does NOT use the OS focus engine. Its chrome
// is virtually focused (see usePlayerNav: a zone plus an index, with each control
// drawn from a `focused` prop) because the transport has to stay reachable while
// the chrome is fading, the progress bar scrubs by held direction, and a panel
// slides in over the top. So directional presses cannot come from focus moves the
// way they do everywhere else in the app - they have to be read off the remote.
//
// `window.addEventListener` is what the web does, and React Native defines
// `window` as `global`: the call is not missing, it is UNDEFINED, so the player
// used to take the whole app down with "undefined is not a function" the moment
// it mounted. This is the same contract fed from `useTVEventHandler`.

import type { RemoteKey } from '@kroma/core';
import { useEffect, useRef } from 'react';
import { type HWEvent, useTVEventHandler } from 'react-native';
import { holdMenuKey, isRemoteKeyUp, releaseMenuKey } from '#ui/lib/tv-remote';
import { type PlayerKeysParams, routeRemoteKey } from '../lib/player-keys';

/**
 * react-native-tvos event types to logical keys.
 *
 * Both halves of the Siri remote are here on purpose: the clickpad's directional
 * presses arrive as `up`/`down`/`left`/`right`, while a thumb swipe on the touch
 * surface arrives as `swipeUp`/`swipeDown`/... They come from different gesture
 * recognizers and never both fire for one gesture, so mapping both is what makes
 * the player answer to the remote the way the rest of tvOS does.
 */
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

/** The remote surface only exists in the react-native-tvos fork; the mobile app
 * runs on mainline React Native, where the import is simply undefined. Bound at
 * module scope so React never sees the hook count change between builds - the
 * same degradation `focus-nav.ts` makes for the rest of the app. */
const useRemoteEvents: (handler: (event: HWEvent) => void) => void =
  typeof useTVEventHandler === 'function' ? useTVEventHandler : () => {};

/**
 * Route the TV remote into the player. The mirror of `usePlayerKeys.web.ts`:
 * same routing, a different source. Metro picks this file, Vite the `.web` one.
 *
 * There are no letter shortcuts here - a remote has no letters - and no
 * `preventDefault`, because a claimed TV event has no default to suppress.
 */
export function usePlayerKeys(params: Readonly<PlayerKeysParams>): void {
  // One handler reading the latest params, so a re-render never re-subscribes.
  const latest = useRef(params);
  latest.current = params;

  // Claim the Menu button for as long as the player is on screen. Unclaimed, tvOS
  // treats it as "leave the app", so Back in the player did not close the settings
  // panel or return to the detail screen - it quit KROMA outright, mid-film.
  //
  // Through the shared counter, not the global switch: the screen underneath
  // holds the same claim, and whichever unmounts first would otherwise drop it
  // for both.
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
