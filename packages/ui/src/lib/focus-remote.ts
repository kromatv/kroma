/// <reference path="types/react-native-tv.d.ts" />
// Wiring the remote into the spatial navigator, once, for every target.
//
// The navigator (react-tv-space-navigation, built on the BBC's LRUD) does not
// listen to anything by itself: it is given a stream of directions and decides
// what is next to what. That is why it behaves identically on an Apple TV, an
// Android TV and a browser-based television - and why this app finally has ONE
// focus engine instead of a native one and a web one that drift apart.
//
// The TV remote is read through `useTVEventHandler`, deliberately: it is a hook
// rather than the plain emitter, and this fork's emitter export has been
// unreliable, while the hook is the path the player has always used. So the
// subscription the navigator asks for is a mailbox, and a hook mounted with the
// screen posts to it.

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

/** LRUD's directions, as plain strings, so nothing depends on the shape of a
 * re-exported enum. */
const UP = 'up';
const DOWN = 'down';
const LEFT = 'left';
const RIGHT = 'right';
const ENTER = 'enter';

type Direction = typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT | typeof ENTER;

/** The remote's vocabulary. Both halves of the Siri remote are here: the
 * clickpad sends `up`/`down`/..., a thumb swipe on the touch surface sends
 * `swipeUp`/`swipeDown`/... They come from different gesture recognisers and
 * never both fire for one gesture. */
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

/**
 * Where directions are posted while a navigator is listening.
 *
 * A SET, not a single slot: screens stack, so two navigators can be subscribed
 * for a moment, and React tears the old subscription down AFTER the new one is
 * up. With one slot that teardown nulls the live handler and the remote goes
 * dead.
 */
const handlers = new Set<(direction: Direction) => void>();

/**
 * Point the navigator at whichever remote this build actually has.
 *
 * Called once, at startup, before the first screen renders. Calling it twice is
 * harmless: the navigator keeps only the latest pair.
 */
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

/** True when the running React Native ships the TV remote surface. Resolved at
 * module scope so the hook count never changes between builds. */
const HAS_TV_EVENTS = typeof useTVEventHandler === 'function';
const useRemoteEvents: (handler: (event: HWEvent) => void) => void = HAS_TV_EVENTS
  ? useTVEventHandler
  : () => {};

/**
 * Posts the TV remote into the navigator. Mounted by <FocusScope>, so it lives
 * exactly as long as a screen does.
 *
 * `on` is how a scope drawn INSIDE another one opts out: this posts to EVERY
 * registered navigator (the handler set below), so a second live bridge would
 * deliver each press twice and the ring would jump two controls. See
 * <FocusScope>'s `bridge` prop for who says no and why.
 */
export function useRemoteBridge(on = true): void {
  useRemoteEvents((event: HWEvent) => {
    if (!on) return;
    if (isRemoteKeyUp(event)) return;
    // Something full-screen is over the app (the brand intro): it owns the
    // remote, and moving focus on a screen nobody can see is worse than inert.
    if (inputHeld()) return;
    const direction = REMOTE[event.eventType];
    if (!direction) return;
    markPress();
    for (const handle of handlers) handle(direction);
  });
}

// ---- Android, which does not have the stream above at all ----
//
// `useTVEventHandler` reads `onHWKeyEvent`, and on Android that event comes from
// ReactAndroidHWInputDeviceHelper, built only by the LEGACY ReactRootView. Under
// the new architecture the root is ReactSurfaceView, which routes keys to
// per-view `onKeyDown` through JSKeyDispatcher instead - so on Android TV the
// hook above never fires once, and the remote is dead in a way that looks like a
// focus bug. The events arrive at the VIEW that holds focus, which is the key
// host in focus-root.tsx; these are the props it spreads.
//
// The other half is native: the `enableKeyEvents` flag defaults to false and is
// turned on by clients/tv-native/plugins/with-tv-key-events.js. Neither half is
// any use alone.

/** Android's spelling of the directions, from the renderer's own table. */
const KEY_CODES: Record<string, Direction> = {
  ArrowUp: UP,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
  Enter: ENTER,
};

/** Props for the focus root's key host. Empty off Android, where the hook above
 * is the whole story. */
export interface RemoteHostProps {
  onKeyDown?: (event: NativeSyntheticEvent<TVKeyEvent>) => void;
}

/** Whoever is collecting typed text right now - in practice the on-screen
 * keyboard while it is mounted. A SET for the same reason `handlers` is one:
 * screens stack, and React tears the old subscription down after the new one is
 * up. */
const typists = new Set<(key: string) => void>();

const NO_HOST_PROPS: RemoteHostProps = {};
const IS_ANDROID = Platform.OS === 'android';

export function useRemoteHostProps(): RemoteHostProps {
  const onKeyDown = useCallback((event: NativeSyntheticEvent<TVKeyEvent>) => {
    // No key-up filter: this is the DOWN event, and `onKeyUp` is a separate prop
    // nothing subscribes to.
    if (inputHeld()) return;
    const { code, key, altKey, ctrlKey, metaKey } = event.nativeEvent;
    // Auto-repeat from a held direction is how a TV scrolls a long rail, so it
    // is passed through exactly like a fresh press.
    const direction = KEY_CODES[code];
    if (direction) {
      markPress();
      for (const handle of handlers) handle(direction);
      return;
    }
    // Not a direction: it may be someone TYPING. See `useHardwareKeys`.
    if (altKey || ctrlKey || metaKey) return;
    if (key !== 'Backspace' && key.length !== 1) return;
    for (const handle of typists) handle(key);
  }, []);
  return IS_ANDROID ? { onKeyDown } : NO_HOST_PROPS;
}

/**
 * Characters from a HARDWARE keyboard, for whoever is collecting text.
 *
 * An Android TV box takes a bluetooth keyboard, and the emulator simply has one,
 * and until now neither could type a single letter into this app: the browser
 * shells handle it with a `document` keydown listener (see @kroma/tv's
 * `usePhysicalTyping`), which native has no equivalent of, and the on-screen
 * keyboard was the only way in.
 *
 * It is deliberately NOT wired to `physicalKeyboard` in the TV env. That
 * capability means "render a real, typeable text input INSTEAD of the on-screen
 * keyboard", which is wrong here twice over: a television still needs the
 * on-screen keyboard for the remote, and a native `TextInput` would summon the
 * platform IME over the app. This types straight into the value with the
 * on-screen keyboard still up and still working - the same bargain the browser
 * shells already strike.
 *
 * Directions never arrive here; they are spent above. `Enter` is a direction
 * too, so it still activates the focused key rather than typing.
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
