/// <reference path="types/react-native-tv.d.ts" />
// Native focus engine (Apple TV, Android TV, and phones).
//
// The OS focus engine owns directional movement: UIFocusEngine on tvOS, the
// Android view hierarchy's nextFocus resolution on Android TV. That is a strict
// upgrade over a geometric scan in JavaScript - real remote semantics, correct
// focus sounds, focus memory, scroll-to-reveal, no measurement storm on every key
// press - so this module never moves focus itself. It bridges the two keys the
// OS does NOT route to a focusable: Back and PlayPause. (OK is not handled here
// either: Pressable fires `onPress` on Select natively, and `<Focusable>`
// applies the press guard.)
//
// The TV remote APIs only exist in the react-native-tvos fork, and the mobile
// app runs on mainline React Native. Everything below degrades to a no-op when
// they are absent, so the SAME screens and the same <Focusable> compile and run
// on a phone.

import { useEffect } from 'react';
import { BackHandler, type HWEvent, useTVEventHandler } from 'react-native';
import { resetFocusEntry } from './focus-entry';
import type { FocusNavHandlers } from './focus-types';
import { inputHeld } from './input-gate';
import { armPressGuard } from './press-guard';
import { holdMenuKey, isRemoteKeyUp, releaseMenuKey } from './tv-remote';

/** tvOS delivers the remote's Menu button as this event once the menu key is
 * claimed; Android TV routes its Back button through BackHandler instead. */
const BACK_EVENTS = new Set(['menu', 'back']);
const PLAY_PAUSE_EVENTS = new Set(['playPause', 'play', 'pause']);

/**
 * True when the running React Native ships the TV remote surface, i.e. when this
 * is the react-native-tvos fork. Resolved once at module scope so the hook
 * below always calls the same number of hooks, whichever build it lands in.
 */
const HAS_TV_EVENTS = typeof useTVEventHandler === 'function';

/** `useTVEventHandler` where it exists, a no-op hook where it does not. Bound at
 * module scope so React never sees the hook count change. */
const useRemoteEvents: (handler: (event: HWEvent) => void) => void = HAS_TV_EVENTS
  ? useTVEventHandler
  : () => {};

function useFocusNav({ onBack, onPlayPause, resetKey }: FocusNavHandlers): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is an intentional re-run trigger, mirroring the web engine; it is not read inside the effect.
  useEffect(() => {
    // Arm the guard on mount exactly like the web engine, so a held Select that
    // opened this screen cannot also fire the control the OS auto-focuses.
    armPressGuard();
    // A new screen gets to decide where focus opens again: see lib/focus-entry.
    resetFocusEntry();
  }, [resetKey]);

  useEffect(() => {
    if (!onBack) return;
    // Claim the Menu key so tvOS reports it instead of backing out of the app.
    // Absent on a phone, where the hardware back button below is the whole story.
    holdMenuKey();
    // A held remote still consumes Back (`true`), it just does nothing with it:
    // letting it through would leave the app while an overlay is on screen.
    const sub = BackHandler.addEventListener('hardwareBackPress', () =>
      inputHeld() ? true : onBack() !== false,
    );
    return () => {
      sub.remove();
      releaseMenuKey();
    };
  }, [onBack]);

  useRemoteEvents((evt: HWEvent) => {
    if (isRemoteKeyUp(evt) || inputHeld()) return;
    if (BACK_EVENTS.has(evt.eventType)) onBack?.();
    else if (PLAY_PAUSE_EVENTS.has(evt.eventType)) onPlayPause?.();
  });
}

export { useFocusNav };
