// Wiring the remote into the spatial navigator, on the browser targets, where
// it arrives as ordinary key events on the document.

import { Directions, SpatialNavigation } from 'react-tv-space-navigation';
import { webDocument } from './dom';
import { markPress } from './perf';

// Tizen and webOS name the four directions without the `Arrow` prefix.
const KEYS: Record<string, Directions> = {
  ArrowUp: Directions.UP,
  ArrowDown: Directions.DOWN,
  ArrowLeft: Directions.LEFT,
  ArrowRight: Directions.RIGHT,
  Enter: Directions.ENTER,
  Up: Directions.UP,
  Down: Directions.DOWN,
  Left: Directions.LEFT,
  Right: Directions.RIGHT,
};

export function configureRemote(): void {
  SpatialNavigation.configureRemoteControl({
    remoteControlSubscriber: (handle: (direction: Directions) => void) => {
      const document = webDocument();
      if (!document) return () => {};
      const onKey = (event: KeyboardEvent) => {
        const direction = KEYS[event.key];
        if (!direction) return;
        // No text-entry guard, deliberately: react-native-web's TextInput calls
        // stopPropagation() on every keydown (its issue #612), so a key pressed
        // while a field holds the caret never reaches this listener.
        // Without preventDefault a television's browser scrolls the page on an
        // arrow key and the focused control walks out of the viewport.
        event.preventDefault();
        markPress();
        handle(direction);
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    },
    remoteControlUnsubscriber: (stop: () => void) => stop(),
  });
}

/** Nothing to mount: the listener above is not tied to a screen. Kept so
 * <FocusScope> can call it on every target. */
export function useRemoteBridge(_on = true): void {
  // Intentionally empty.
}

/** Nothing to subscribe to: a browser shell already reads its hardware keyboard
 * from `document` (see @kroma/tv's `usePhysicalTyping`). Kept so the on-screen
 * keyboard can call the same hook on every target. */
export function useHardwareKeys(_handle: (key: string) => void): void {
  // Intentionally empty.
}
