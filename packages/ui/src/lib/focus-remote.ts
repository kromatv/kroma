import { useFocusServices } from './focus-services-context';
import type { RemoteTransportOptions } from './remote-transport-types';
/// <reference path="types/react-native-tv.d.ts" />
// Feeds the TV remote into the spatial navigator, which reacts only to a posted
// stream of directions.
//
// Read via `useTVEventHandler` rather than the plain emitter: this fork's
// emitter export has been unreliable.

import { type Direction, Directions } from '@kromatv/spatial-nav';
import { useCallback, useEffect, useEffectEvent } from 'react';
import {
  type HWEvent,
  type NativeSyntheticEvent,
  Platform,
  type TVKeyEvent,
  useTVEventHandler,
} from 'react-native';
import type { RemoteKey } from '#ui/lib/remote-keys';
import { useInputGate } from './input-gate';
import type { PerfSampler } from './perf';
import { usePerfSampler } from './perf-provider';
import { isRemoteKeyUp } from './tv-remote';

// Both Siri Remote input paths, clickpad and touch-surface swipes, land here:
// they never fire for the same gesture.
const REMOTE: Record<string, Direction> = {
  up: Directions.UP,
  down: Directions.DOWN,
  left: Directions.LEFT,
  right: Directions.RIGHT,
  swipeUp: Directions.UP,
  swipeDown: Directions.DOWN,
  swipeLeft: Directions.LEFT,
  swipeRight: Directions.RIGHT,
};

const RELEASE = Directions.RELEASE;
const HOLD = Directions.HOLD;
const TAP: readonly Direction[] = [Directions.ENTER, RELEASE];
const NONE: readonly Direction[] = [];
const IS_ANDROID = Platform.OS === 'android';

type Transport = 'events' | 'host';
export function createRemoteTransport({ enabled }: RemoteTransportOptions) {
  const handlers = new Set<(direction: Direction) => void>();
  const typists = new Set<(key: string) => void>();
  const remoteKeys = new Set<(key: RemoteKey) => void>();
  let owner: Transport | null = null;
  return {
    enabled,
    typists,
    remoteKeys,
    subscribe(handle: (direction: Direction) => void) {
      if (!enabled) return () => {};
      handlers.add(handle);
      return () => {
        handlers.delete(handle);
      };
    },
    stepRing(direction: Direction, from: Transport, perf?: PerfSampler | null) {
      owner ??= from;
      if (owner !== from) return;
      perf?.markPress();
      for (const handle of handlers) handle(direction);
    },
    postRemoteDirection(direction: Direction) {
      for (const handle of handlers) handle(direction);
    },
  };
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
  const { remote } = useFocusServices();
  const { inputHeld } = useInputGate();
  const perf = usePerfSampler();
  useRemoteEvents((event: HWEvent) => {
    if (!on) return;
    // A full-screen overlay (the brand intro) owns the remote while it's up.
    if (inputHeld()) return;
    for (const direction of directionsOf(event)) remote.stepRing(direction, 'events', perf);
  });
}

function directionsOf(event: HWEvent): readonly Direction[] {
  if (event.eventType === 'longSelect') return [event.eventKeyAction === 1 ? RELEASE : HOLD];
  if (event.eventType === 'select') {
    if (!IS_ANDROID) return TAP;
    return [isRemoteKeyUp(event) ? RELEASE : Directions.ENTER];
  }
  const direction = isRemoteKeyUp(event) ? undefined : REMOTE[event.eventType];
  return direction ? [direction] : NONE;
}

// Android TV: the new architecture (ReactSurfaceView) routes keys to per-view
// `onKeyDown` via JSKeyDispatcher instead of `onHWKeyEvent`, so `useTVEventHandler`
// above never fires. These are the props the key host in focus-root.tsx spreads
// onto the focused view; native's `enableKeyEvents` flag (turned on by
// clients/tv-native/plugins/with-tv-key-events.js) must also be set, or neither
// half does anything.
const KEY_CODES: Record<string, Direction> = {
  ArrowUp: Directions.UP,
  ArrowDown: Directions.DOWN,
  ArrowLeft: Directions.LEFT,
  ArrowRight: Directions.RIGHT,
  Enter: Directions.ENTER,
};

// The same d-pad keys as the player's own vocabulary. The player chrome drives
// a virtual focus of its own instead of the spatial navigator (see
// player/lib/virtual-focus), so on Android it needs these presses from this
// host too - the tvOS half reads them straight off `useTVEventHandler`.
const REMOTE_KEY: Record<string, RemoteKey> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Enter',
};

/** Empty off Android, where `useTVEventHandler` above is the whole story. */
export interface RemoteHostProps {
  onKeyDown?: (event: NativeSyntheticEvent<TVKeyEvent>) => void;
  onKeyUp?: (event: NativeSyntheticEvent<TVKeyEvent>) => void;
}

const NO_HOST_PROPS: RemoteHostProps = {};

/** Spread by <FocusRoot>. `on` takes <FocusScope>'s `bridge`: the key events
 * BUBBLE, so a scope nested inside another must not carry a second host or one
 * press walks the ring twice. */
export function useRemoteHostProps(on = true): RemoteHostProps {
  const { remote } = useFocusServices();
  const { inputHeld } = useInputGate();
  const perf = usePerfSampler();
  const onKeyDown = useCallback(
    (event: NativeSyntheticEvent<TVKeyEvent>) => {
      if (inputHeld()) return;
      const { code, key, altKey, ctrlKey, metaKey } = event.nativeEvent;
      // Auto-repeat from a held direction is how a TV scrolls a long rail.
      const direction = KEY_CODES[code];
      if (direction) {
        if (direction !== Directions.ENTER || !event.nativeEvent.repeat)
          remote.stepRing(direction, 'host', perf);
        // Fanned to the player chrome as well, the same way `useTVEventHandler`
        // feeds both the navigator bridge and the player on tvOS. Sent whatever
        // `stepRing` decided: the chrome keeps its own virtual focus and counts
        // its own presses (see player/hooks/use-player-keys), so suppressing this
        // to match the ring would leave the player deaf instead of steady.
        const remoteKey = REMOTE_KEY[code];
        if (remoteKey) for (const sub of remote.remoteKeys) sub(remoteKey);
        return;
      }
      // Not a direction: may be someone typing. See `useHardwareKeys`.
      if (altKey || ctrlKey || metaKey) return;
      if (key !== 'Backspace' && key.length !== 1) return;
      for (const handle of remote.typists) handle(key);
    },
    [perf, inputHeld, remote],
  );
  const onKeyUp = useCallback(
    (event: NativeSyntheticEvent<TVKeyEvent>) => {
      if (KEY_CODES[event.nativeEvent.code] === Directions.ENTER)
        remote.stepRing(RELEASE, 'host', perf);
    },
    [perf, remote],
  );
  return IS_ANDROID && on ? { onKeyDown, onKeyUp } : NO_HOST_PROPS;
}

/**
 * Delivers hardware-keyboard keystrokes (e.g. a Bluetooth keyboard on Android TV)
 * to whoever is collecting text; directions are consumed above and never reach
 * here. Deliberately not wired to the `physicalKeyboard` capability, which swaps
 * in a native `TextInput` and would summon the platform IME over the on-screen
 * keyboard the remote still needs.
 */
export function useHardwareKeys(handle: (key: string) => void): void {
  // An effect event: one identity in the set for the subscriber's lifetime,
  // always calling the latest `handle`.
  const { remote } = useFocusServices();
  const forward = useEffectEvent((key: string) => handle(key));
  useEffect(() => {
    remote.typists.add(forward);
    return () => {
      remote.typists.delete(forward);
    };
  }, [remote]);
}

/**
 * Delivers d-pad presses to a chrome driving its own virtual focus (the
 * player): the Android mirror of the `useTVEventHandler` the player reads on
 * tvOS. Same effect-event identity trick as {@link useHardwareKeys}.
 */
export function useRemoteKeys(handle: (key: RemoteKey) => void): void {
  const { remote } = useFocusServices();
  const forward = useEffectEvent((key: RemoteKey) => handle(key));
  useEffect(() => {
    remote.remoteKeys.add(forward);
    return () => {
      remote.remoteKeys.delete(forward);
    };
  }, [remote]);
}
