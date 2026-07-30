// The one place the shared code is allowed to ask for the DOM.
//
// Most of the kit renders through React Native and never touches a document.
// A few pieces genuinely are browser features (the player's CSS keyframes, Web
// Audio leveling, the scrub-bar's visibility listener) with nothing to do on a
// television or a phone. An unguarded `document.addEventListener` is a
// ReferenceError there, which React Native turns into SIGABRT - so the check
// lives here, once, as "is there a document?" rather than "does this crash?".

/** The DOM document, or null on a target that has none. */
export function webDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

/**
 * The DOM window, or null on a target that has none.
 *
 * `typeof window === 'undefined'` is the guard most reach for, and it is WRONG
 * here: React Native defines `window` as an alias of `global`, so the check
 * passes and `window.addEventListener` throws as "not a function" instead of
 * being absent. This asks the question that actually separates the two
 * worlds: does this window carry the DOM event API?
 */
export function webWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  const w = window as Partial<Window>;
  return typeof w.addEventListener === 'function' ? (window as Window) : null;
}
