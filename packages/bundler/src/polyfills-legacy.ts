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
// react-native-web measures a view only once `Node.isConnected` (Chrome 54)
// says it is in the document, and hears a size only through ResizeObserver
// (Chrome 64): without both, `onLayout` and `measureLayout` never answer and
// no page or rail scrolls.
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import 'intersection-observer';
import { clipAsHidden } from './clip-as-hidden';
import { flexGaps } from './flex-gaps';
import { connectNodes } from './is-connected';
import { provideResizeObserver } from './resize-observer';
import { roundOutlines } from './round-outlines';

if (!('BigInt' in window)) {
  Object.defineProperty(window, 'BigInt', {
    value: Number,
    configurable: true,
    writable: true,
  });
}

connectNodes(Node);
provideResizeObserver(window);
roundOutlines(document);
flexGaps(document);
clipAsHidden();
