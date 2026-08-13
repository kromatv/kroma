/// <reference path="types/react-native-tv.d.ts" />
// Feeds the TV remote into the spatial navigator (react-tv-space-navigation),
// which reacts only to a posted stream of directions.
//
// Read via `useTVEventHandler` rather than the plain emitter: this fork's
// emitter export has been unreliable.

import { useCallback, useEffect, useRef } from 'react';
import {
  type HWEvent,
  type NativeSyntheticEvent,
  Platform,
  type TVKeyEvent,
  useTVEventHandler,
} from 'react-native';
import { SpatialNavigation } from 'react-tv-space-navigation';
import { inputHeld } from './input-gate';
import { markPress } from './perf';
import { isRemoteKeyUp } from './tv-remote';

const UP = 'up';
const DOWN = 'down';
const LEFT = 'left';
const RIGHT = 'right';
const ENTER = 'enter';

type Direction = typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT | typeof ENTER;

// Both Siri Remote input paths, clickpad and touch-surface swipes, land here:
// they never fire for the same gesture.
const REMOTE: Record<string, Direction> = {
  up: UP,
  down: DOWN,
  left: LEFT,
  right: RIGHT,
  swipeUp: UP,
  swipeDown: DOWN,
  swipeLeft: LEFT,
  swipeRight: RIGHT,
  select: ENTER,
};

// A SET, not a single slot: screens stack, so two navigators can be subscribed
// for a moment, and React tears the old subscription down AFTER the new one is
// up. One slot would let that teardown null the live handler.
const handlers = new Set<(direction: Direction) => void>();

/** Call once at startup, before the first screen renders; calling it twice is
 * harmless, the navigator keeps only the latest pair. */
export function configureRemote(): void {
  SpatialNavigation.configureRemoteControl({
    remoteControlSubscriber: (handle: (direction: Direction) => void) => {
      handlers.add(handle);
      return () => {
        handlers.delete(handle);
      };
    },
    remoteControlUnsubscriber: (stop: () => void) => stop(),
  });
}

/**
 * Posts a direction the app never heard as a press. One caller: a platform
 * chrome that answered the press itself and is handing the focus over (see
 * lib/focus-platform), where the navigator has to pick the ring up in the
 * direction the viewer was already moving.
 */
export function postRemoteDirection(direction: Direction): void {
  for (const handle of handlers) handle(direction);
}

// Resolved at module scope so the hook count never changes between builds.
const HAS_TV_EVENTS = typeof useTVEventHandler === 'function';
const useRemoteEvents: (handler: (event: HWEvent) => void) => void = HAS_TV_EVENTS
  ? useTVEventHandler
  : () => {};

/** Mounted by <FocusScope>. `on` lets a scope nested inside another opt out:
 * this posts to EVERY registered navigator, so two live bridges would deliver
 * each press twice. See <FocusScope>'s `bridge` prop. */
export function useRemoteBridge(on = true): void {
  useRemoteEvents((event: HWEvent) => {
    if (!on) return;
    if (isRemoteKeyUp(event)) return;
    // A full-screen overlay (the brand intro) owns the remote while it's up.
    if (inputHeld()) return;
    const direction = REMOTE[event.eventType];
    if (!direction) return;
    markPress();
    for (const handle of handlers) handle(direction);
  });
}

// Android TV: the new architecture (ReactSurfaceView) routes keys to per-view
// `onKeyDown` via JSKeyDispatcher instead of `onHWKeyEvent`, so `useTVEventHandler`
// above never fires. These are the props the key host in focus-root.tsx spreads
// onto the focused view; native's `enableKeyEvents` flag (turned on by
// clients/tv-native/plugins/with-tv-key-events.js) must also be set, or neither
// half does anything.
const KEY_CODES: Record<string, Direction> = {
  ArrowUp: UP,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
  Enter: ENTER,
};

/** Empty off Android, where `useTVEventHandler` above is the whole story. */
export interface RemoteHostProps {
  onKeyDown?: (event: NativeSyntheticEvent<TVKeyEvent>) => void;
}

// Same Set-not-slot reasoning as `handlers` above.
const typists = new Set<(key: string) => void>();

const NO_HOST_PROPS: RemoteHostProps = {};
const IS_ANDROID = Platform.OS === 'android';

export function useRemoteHostProps(): RemoteHostProps {
  const onKeyDown = useCallback((event: NativeSyntheticEvent<TVKeyEvent>) => {
    // This is the DOWN event; `onKeyUp` is a separate prop nothing subscribes to.
    if (inputHeld()) return;
    const { code, key, altKey, ctrlKey, metaKey } = event.nativeEvent;
    // Auto-repeat from a held direction is how a TV scrolls a long rail.
    const direction = KEY_CODES[code];
    if (direction) {
      markPress();
      for (const handle of handlers) handle(direction);
      return;
    }
    // Not a direction: may be someone typing. See `useHardwareKeys`.
    if (altKey || ctrlKey || metaKey) return;
    if (key !== 'Backspace' && key.length !== 1) return;
    for (const handle of typists) handle(key);
  }, []);
  return IS_ANDROID ? { onKeyDown } : NO_HOST_PROPS;
}

/**
 * Delivers hardware-keyboard keystrokes (e.g. a Bluetooth keyboard on Android TV)
 * to whoever is collecting text; directions are consumed above and never reach
 * here. Deliberately not wired to the `physicalKeyboard` capability, which swaps
 * in a native `TextInput` and would summon the platform IME over the on-screen
 * keyboard the remote still needs.
 */
export function useHardwareKeys(handle: (key: string) => void): void {
  const latest = useRef(handle);
  latest.current = handle;
  useEffect(() => {
    // A stable identity in the set, so a re-render cannot leak a subscription.
    const forward = (key: string): void => latest.current(key);
    typists.add(forward);
    return () => {
      typists.delete(forward);
    };
  }, []);
}
