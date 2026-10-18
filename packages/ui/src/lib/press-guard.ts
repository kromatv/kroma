// The OK guard. Platform-neutral: both focus engines arm it, every <Focusable>
// consults it.
//
// Don't let one physical OK carry past the screen it opened. The press that
// navigates somewhere (card -> detail) would otherwise also fire the control the
// new screen auto-focuses (detail -> Play -> player), via the remote's key repeat
// or a keyup/keydown bounce. So presses are ignored for a short window after
// every screen mounts: long enough to swallow the stray repeat, short enough
// that a deliberate second press still lands.
//
// Hoisted to the app root so it survives a screen transition.

/** Default window, in milliseconds. */
export const PRESS_GUARD_MS = 300;

/** The guard survives screen transitions within its owning app root. */
export function createPressGuard() {
  let guardedUntil = 0;
  return {
    armPressGuard(ms = PRESS_GUARD_MS) {
      guardedUntil = Date.now() + ms;
    },
    pressGuardActive: () => Date.now() < guardedUntil,
    clearPressGuard() {
      guardedUntil = 0;
    },
  };
}
