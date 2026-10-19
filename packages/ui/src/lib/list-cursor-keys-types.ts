/** The keys a list cursor answers to. */
export interface ListCursorKeysOptions<T> {
  /** The row the cursor is on. */
  cursor: T;
  /** Rows to move the cursor by: one for an arrow, a page for PageUp/PageDown. */
  onStep: (rows: number) => void;
  /** Enter: open whatever the cursor is on. */
  onChoose: () => void;
  onClose: () => void;
}

/** What PageUp and PageDown are worth. */
export const PAGE = 8;
