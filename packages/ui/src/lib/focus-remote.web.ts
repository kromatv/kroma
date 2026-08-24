// Wiring the remote into the spatial navigator, on the browser targets, where
// it arrives as ordinary key events on the document.

import { Directions, SpatialNavigation } from 'react-tv-space-navigation';
import { webDocument } from './dom';
import { focusBox, focusSeq } from './focus-here';
import { walkTab } from './focus-tab';
import { markPress } from './perf';

const PROBE = { seq: focusSeq, box: focusBox };

type Direction = 'up' | 'down' | 'left' | 'right' | 'enter';

const handlers = new Set<(direction: Directions) => void>();

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

// `KeyboardEvent.key` is Chrome 51 and the deep tier's floor is 47, so on a 2017
// set the property is simply absent and every lookup above misses. The app then
// installs, paints correctly and cannot be navigated at all, which is the worst
// shape a failure can take: nothing looks wrong. Samsung's own simulator posts
// the same event, a keyCode and no `key`, which is how this was caught.
// Read once, here, because there is no undeprecated way to identify a key on an
// engine that predates `KeyboardEvent.key`: `code` is Chrome 48 and `which` is
// deprecated too. The tier this exists for is M47.
// `KeyboardEvent.keyCode` is deprecated in the DOM lib, but it is the only
// key identifier this engine tier exposes (see above). Reading it through a
// local shape keeps the one unavoidable access off the deprecated declaration.
type LegacyKeyboardEvent = { keyCode: number };
const legacyCode = (event: KeyboardEvent): number => (event as LegacyKeyboardEvent).keyCode;

const CODES: Record<number, Directions> = {
  37: Directions.LEFT,
  38: Directions.UP,
  39: Directions.RIGHT,
  40: Directions.DOWN,
  13: Directions.ENTER,
};
const TAB_CODE = 9;

// ONE focus, and it is the navigator's. A click parks DOM focus on whatever was
// clicked (react-native-web makes every pressable tabbable), and the CSS focus
// rules then draw a ring there while the navigator's ring is somewhere else -
// two rings, one of which nothing on a remote can move. The moment a key
// arrives, the navigator takes the focus back. A field is left alone: a caret
// belongs where the typing goes.
function dropStrayFocus(document: Document): void {
  const held = document.activeElement as (HTMLElement & { blur?: () => void }) | null;
  if (!held || held === document.body) return;
  const tag = held.tagName;
  if (held.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  held.blur?.();
}

export function configureRemote(): void {
  SpatialNavigation.configureRemoteControl({
    remoteControlSubscriber: (handle: (direction: Directions) => void) => {
      handlers.add(handle);
      const document = webDocument();
      if (!document) {
        return () => {
          handlers.delete(handle);
        };
      }
      const onKey = (event: KeyboardEvent) => {
        // Tab is the browser's OWN focus walk, and it moves DOM focus - a
        // second focus, landing on a different control from the navigator's.
        // Two owners means two rings and a remote that resumes from somewhere
        // the eye is not. So Tab drives the navigator and never the browser -
        // as reading order, which is Tab's own meaning and not the right arrow's
        // (see `focus-tab`).
        if (event.key === 'Tab' || (!event.key && legacyCode(event) === TAB_CODE)) {
          event.preventDefault();
          dropStrayFocus(document);
          markPress();
          walkTab(handle, PROBE, event.shiftKey);
          return;
        }
        // Only where `key` is absent, matching the Tab branch above. This file
        // is shared with the web client and the modern tiers, where a button
        // reporting `Unidentified` alongside a legacy keyCode would otherwise
        // steer the navigator instead of being ignored.
        const direction = event.key ? KEYS[event.key] : CODES[legacyCode(event)];
        if (!direction) return;
        // No text-entry guard, deliberately: react-native-web's TextInput calls
        // stopPropagation() on every keydown (its issue #612), so a key pressed
        // while a field holds the caret never reaches this listener.
        // Without preventDefault a television's browser scrolls the page on an
        // arrow key and the focused control walks out of the viewport.
        event.preventDefault();
        dropStrayFocus(document);
        markPress();
        handle(direction);
      };
      document.addEventListener('keydown', onKey);
      return () => {
        handlers.delete(handle);
        document.removeEventListener('keydown', onKey);
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
  for (const handle of handlers) handle(direction as Directions);
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
