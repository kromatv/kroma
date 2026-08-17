// Both older tiers (Chromium 47 and 53), imported FIRST by a shell's
// main.legacy.ts / main.deep.ts.
//
// No `core-js` here on purpose. It used to be `core-js/stable`, the library's
// entire surface, of which a TV bundle reaches about forty modules; the tiers'
// post-build pass now injects exactly those, which it can only do accurately
// once the bundle exists. Importing both would be additive, not a replacement.
//
// What core-js does not carry stays: AbortController is Chrome 66 (this build
// also patches fetch to honour `signal`) and IntersectionObserver is Chrome 51.
// ResizeObserver is deliberately absent, in every tier: the player falls back
// for a missing one on purpose.
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import 'intersection-observer';
