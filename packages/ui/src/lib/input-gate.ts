// The remote's off switch, for the moments something full-screen owns it.
//
// On the browser targets an overlay takes the remote by listening on the capture
// phase and stopping the event, so the app underneath never sees the key. Native
// has no capture phase: `useTVEventHandler` is additive, and both platforms hand
// a Select straight to whichever control holds focus. An overlay therefore shows
// over an app that still answers every button.
//
// The brand intro is where that became visible: the press meant to skip the film
// also activated the card focused behind it, and the intro faded out onto a
// screen nobody chose. So an overlay HOLDS the input instead, and the three
// places that turn a remote event into behaviour (the navigator bridge, the
// Back / PlayPause bridge and a control's press) do nothing while it does.
//
// Counted, so two overlays cannot release each other's hold, and releasing arms
// the press guard: the button that ends an overlay must not also land on what
// was underneath it.

import { armPressGuard } from './press-guard';

let holders = 0;

/**
 * Take the remote for as long as something is over the app.
 *
 * Returns the release, which is idempotent (safe to call from a React cleanup
 * that runs twice under StrictMode).
 */
export function holdInput(): () => void {
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) armPressGuard();
  };
}

/** True while an overlay owns the remote and the app must stay inert. */
export function inputHeld(): boolean {
  return holders > 0;
}

/** Test seam: drop every hold. */
export function clearInputHolds(): void {
  holders = 0;
}
