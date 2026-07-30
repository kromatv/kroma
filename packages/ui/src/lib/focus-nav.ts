/// <reference path="types/react-native-tv.d.ts" />
// Bridges the two keys the OS focus engine does NOT route to a focusable, Back
// and PlayPause; directional movement stays the OS's job. The TV remote APIs
// exist only in the react-native-tvos fork, so this no-ops on mainline RN.

import { useEffect } from 'react';
import { BackHandler, type HWEvent, useTVEventHandler } from 'react-native';
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
    // A held remote still consumes Back (`true`): letting it through would leave
    // the app while an overlay is on screen.
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
