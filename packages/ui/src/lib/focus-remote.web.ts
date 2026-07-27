// Wiring the remote into the spatial navigator, on the browser targets.
//
// The mirror of `focus-remote.ts`: same navigator, same four directions, a
// different source. Tizen and webOS deliver their remote as key events on the
// document, and so do the desktop shell and a developer's arrow keys - so there
// is nothing to bridge from React here, and no hook to mount.

import { Directions, SpatialNavigation } from 'react-tv-space-navigation';
import { webDocument } from './dom';
import { markPress } from './perf';

/** The keys a television's browser sends. Tizen and webOS name the four
 * directions without the `Arrow` prefix; everything else is a keyboard. */
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
        // No guard here for text entries, deliberately: react-native-web's
        // TextInput calls stopPropagation() on every keydown (its issue #612),
        // so a key pressed while a field holds the caret never reaches this
        // listener in the first place. Typing already wins - and note the flip
        // side, which is NOT this file's to fix: while a field holds DOM focus
        // the navigator cannot be driven at all.
        //
        // A television's browser scrolls the page on an arrow key otherwise, and
        // the focused control walks out of the viewport.
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
export function useRemoteBridge(): void {
  // Intentionally nothing: the browser tier's key listener is installed at
  // module scope above, not per screen. This half exists so <FocusScope> has
  // the same call on every target.
}

// No `useRemoteHostProps` here on purpose. Its only caller is the NATIVE focus
// root, and focus-root is forked (focus-root.web.tsx renders no element at all),
// so a web copy would be dead code pretending to be symmetry.

/** Nothing to subscribe to: a browser shell already reads its hardware keyboard
 * from `document` (see @kroma/tv's `usePhysicalTyping`), which is both older and
 * better placed - it can see the real `<input>` the desktop shell renders and
 * stay out of its way. This exists so the on-screen keyboard can call the same
 * hook on every target. */
export function useHardwareKeys(_handle: (key: string) => void): void {
  // Intentionally nothing. The browser tier reaches keys through the DOM, so
  // this half exists only to give every target the same call site.
}
