// Legacy tier (Chromium 53-94), imported FIRST by the shell's main.legacy.ts.
// core-js does not ship AbortController (Chrome 66; this build also patches fetch
// to honour `signal`) or IntersectionObserver (Chrome 51).
import 'core-js/stable';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import 'intersection-observer';
