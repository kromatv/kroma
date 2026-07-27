// The one place the shared code is allowed to ask for the DOM.
//
// Most of the kit renders through React Native and never touches a document.
// A few pieces genuinely are browser features (the player's CSS keyframes, Web
// Audio leveling, the scrub-bar's visibility listener) and simply have nothing
// to do on a television or a phone. They used to test for that inline, which was
// easy to forget: `document.addEventListener` in the storyboard poller had no
// guard at all, and on Apple TV that is a ReferenceError, which React Native
// turns into an unhandled exception and the runtime into SIGABRT.
//
// So the check lives here, once, and reads as a question the caller answers
// deliberately: "is there a document?" rather than "does this crash?".

/** The DOM document, or null on a target that has none. */
export function webDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

/**
 * The DOM window, or null on a target that has none.
 *
 * `typeof window === 'undefined'` is the guard everyone reaches for and it is
 * WRONG here: React Native defines `window`, as an alias of `global`. The test
 * passes, `window.addEventListener` is then undefined rather than absent, and
 * calling it throws "undefined is not a function" - which is how the player and
 * the seek gesture each took the whole app down on Apple TV.
 *
 * So this asks the question that actually separates the two worlds: does this
 * window carry the DOM event API?
 */
export function webWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  const w = window as Partial<Window>;
  return typeof w.addEventListener === 'function' ? (window as Window) : null;
}
