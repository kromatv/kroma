/**
 * Hands the document's focus to the control the navigator just focused. Native
 * has no document focus to hand: a screen reader there follows the platform's
 * own focus engine.
 */
export function mirrorFocus(_view: unknown): void {
  // Intentionally empty.
}

/** Whether `element` is the control the navigator handed the document's focus
 *  to. Never, off the web. */
export function isMirrored(_element: unknown): boolean {
  return false;
}
