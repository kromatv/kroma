// Where the ring is drawn, for the one caller that needs geometry.
//
// The navigator knows WHICH node holds the focus and nothing about where that
// node ended up on screen. Tab needs the geometry, because reading order is a
// fact about the layout rather than about the tree (see `focus-tab`).
//
// Native answers nothing: a remote has no Tab key, and a phone focuses with a
// thumb, so nobody there asks.

/** The focused control's screen box, in the units the platform reports. */
export interface FocusBox {
  top: number;
  left: number;
  height: number;
}

/** Called by `<Focusable>` as it takes the focus. */
export function noteFocus(_view: unknown): void {
  // Intentionally empty.
}

/** Bumped by every focus, so a caller can tell a move from a refusal. */
export function focusSeq(): number {
  return 0;
}

export function focusBox(): FocusBox | null {
  return null;
}
