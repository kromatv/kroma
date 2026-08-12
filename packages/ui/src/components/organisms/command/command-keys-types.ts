// The contract both halves of the palette's key layer implement.
//
//   command-keys.ts      native  - Apple TV / a phone. There is nothing to
//                                  implement, and that is the design: see the
//                                  file.
//   command-keys.web.ts  web     - Tizen / webOS / desktop / browser. The keys
//                                  are taken on the document's capture phase.

interface CommandKeysOptions {
  /** Rows to move the cursor by: one for an arrow, a page for PageUp/PageDown. */
  onStep: (rows: number) => void;
  /** Enter: open whatever the cursor is on. */
  onChoose: () => void;
  onClose: () => void;
}

/** What PageUp and PageDown are worth. */
const PAGE = 8;

export type { CommandKeysOptions };
export { PAGE };
