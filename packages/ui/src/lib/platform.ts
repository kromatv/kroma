// Which world this bundle is, as a LITERAL the bundler can prune on.
//
// `Platform.OS` is a runtime read of an imported binding, so both arms of every
// branch it guards ship to every platform. This pair of twins says the same
// thing as a per-platform constant: the browser targets resolve platform.web.ts
// (`true`), the native ones this file (`false`), and because the value is a
// module-level literal, Rollup inlines it into the web chunk and the minifier
// deletes the branch the platform can never take. Metro keeps modules separate,
// so native bundles keep the (tiny) dead test - but the twin resolution already
// keeps whole web-only MODULES out of the native graph, which is where the real
// weight is.
//
// Use it for a fork whose two arms share their imports. A fork that needs an
// import the other platform cannot carry (react-dom, react-native-svg, a DOM
// API) stays a `.web.*` twin: resolution is the only pruning that keeps the
// import itself out.

/** True on the browser targets (Vite: web, Tizen, webOS, desktop, workbench),
 *  false under Metro (Apple TV, Android TV, iOS, Android). */
export const WEB = false;
