/// <reference path="types/react-native-tv.d.ts" />
// Bridges the two keys the OS focus engine does NOT route to a focusable, Back
// and PlayPause; directional movement stays the OS's job. The TV remote APIs
// exist only in the react-native-tvos fork, so this no-ops on mainline RN.

import { useEffect } from 'react';
import { BackHandler, type HWEvent, Platform, useTVEventHandler } from 'react-native';
import { resetFocusEntry } from './focus-entry';
import type { FocusNavHandlers } from './focus-types';
import { inputHeld } from './input-gate';
import { armPressGuard } from './press-guard';
import { holdMenuKey, isRemoteKeyUp, releaseMenuKey } from './tv-remote';

// tvOS delivers Menu as this event once the menu key is claimed; Android TV
// routes its Back button through BackHandler instead.
const BACK_EVENTS = new Set(['menu', 'back']);
const PLAY_PAUSE_EVENTS = new Set(['playPause', 'play', 'pause']);

// Resolved once at module scope so React never sees the hook count change
// between builds.
const HAS_TV_EVENTS = typeof useTVEventHandler === 'function';

const useRemoteEvents: (handler: (event: HWEvent) => void) => void = HAS_TV_EVENTS
  ? useTVEventHandler
  : () => {};

function useFocusNav({ onBack, onPlayPause, resetKey }: FocusNavHandlers): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is an intentional re-run trigger, mirroring the web engine; it is not read inside the effect.
  useEffect(() => {
    // A held Select that opened this screen must not also fire the control the
    // OS auto-focuses here.
    armPressGuard();
    resetFocusEntry();
  }, [resetKey]);

  useEffect(() => {
    if (!onBack) return;
    // Claim the Menu key so tvOS reports it instead of backing out of the app.
    holdMenuKey();
    // Android only, phone and TV alike, where BackHandler is a channel of its
    // own. On tvOS this fork implements it ON TOP of the same `menu` event
    // `BACK_EVENTS` maps below, so subscribing there routes one press twice and
    // backs out two screens. Nothing is lost by staying out: tvOS stubs
    // `exitApp` to a no-op, so the `true` returned for a held remote buys
    // nothing. NOT `Platform.isTV` as well - mainline RN defines no such field,
    // and the phone app would lose its hardware Back. The Menu claim above runs
    // on every platform, which is why this guard sits here and not at the top of
    // the effect.
    // A held remote still consumes Back (`true`): letting it through would leave
    // the app while an overlay is on screen.
    const sub =
      Platform.OS === 'android'
        ? BackHandler.addEventListener('hardwareBackPress', () =>
            inputHeld() ? true : onBack() !== false,
          )
        : undefined;
    return () => {
      sub?.remove();
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
