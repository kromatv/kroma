// The web half of the player's opt-out from platform focus: nothing to opt out of.
//
// There is no OS focus engine in a browser, so a chrome control cannot be
// adopted by one; the web player already routes every key itself through
// `usePlayerKeys.web`. Leaving the props alone also keeps the DOM as it is - the
// controls stay clickable and stay where they were in the tab order, and no
// `isTVSelectable` attribute leaks onto an element that has never heard of it.

/** No-op on the web. See virtual-focus.ts for the native counterpart. */
export const VIRTUAL_FOCUS = {} as const;
