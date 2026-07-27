// Which input is driving right now: a pointer sweeping the page, or keys
// walking it.
//
// The reveal scrollers (lib/focus-scroll) ask at focus time. A control the
// pointer just entered is already under the viewer's eyes, and scrolling it to
// the pin line yanks the page out from under a cursor that has not moved -
// which, at the screen's bottom edge, CASCADES: the scroll parks a new control
// under the pointer, that one focuses and scrolls too, and the page walks away
// on its own. The same fight killed the wheel on the detail screens: every
// wheel tick slid a fresh tile under the cursor, whose focus snapped the page
// straight back to the pin. So the wheel counts as the pointer too, and any
// key press re-arms the reveal - a remote or a keyboard is exactly who the
// reveal exists for.
//
// Module-level listeners, web only: on a television there is no pointer and
// this stays permanently false, which is the D-pad behaviour unchanged.

import { webWindow } from './dom';

let pointerDrove = false;

const win = webWindow();
if (win) {
  const pointer = () => {
    pointerDrove = true;
  };
  win.addEventListener('mousemove', pointer, { capture: true, passive: true });
  win.addEventListener('wheel', pointer, { capture: true, passive: true });
  win.addEventListener(
    'keydown',
    () => {
      pointerDrove = false;
    },
    { capture: true },
  );
}

/** True when the last input was the pointer (mouse move or wheel), false the
 * moment a key is pressed. Always false off the web. */
export function pointerDriving(): boolean {
  return pointerDrove;
}
