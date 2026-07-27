// The contract every platform focus engine implements. Two implementations:
//
//   focus-nav.ts      native  - Apple TV / Android TV. The OS focus engine owns
//                               directional movement; we only bridge Back and
//                               PlayPause.
//   focus-nav.web.ts  web     - Tizen / webOS / desktop / browser. The spatial
//                               navigator owns directional movement; we bridge
//                               Back, the transport keys, and the held-OK guard.
//
// Metro picks focus-nav.ts, Vite picks focus-nav.web.ts (resolve.extensions puts
// `.web.*` first). App code only ever imports from './focus-nav'.

export interface FocusNavHandlers {
  /** Remote Back / Escape. Return `false` to say "not handled, keep the
   *  default"; returning nothing counts as handled. */
  // biome-ignore lint/suspicious/noConfusingVoidType: the union IS the contract here - a handler may return nothing (handled) or false (not handled).
  onBack?: () => void | boolean;
  /** Remote Play / Pause / PlayPause. */
  onPlayPause?: () => void;
  /** Re-run the mount behaviour when this changes (e.g. a view switch). */
  resetKey?: unknown;
}

/** What a control that opts out of platform focus tells the PLATFORM focus
 * engines: skip me. react-native-tvos gates a Pressable's focusability on
 * exactly these two (`focusable !== false && isTVSelectable !== false`);
 * `isTVSelectable` is the tvOS spelling and not in mainline RN's types - see
 * components/organisms/player/lib/virtual-focus.ts for the bug this prevents. */
export const UNFOCUSABLE = { focusable: false, isTVSelectable: false } as const;
