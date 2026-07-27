// The player, on the native targets: loaded with everything else.
//
// Metro does not code-split a production bundle, so `import()` buys nothing
// there. In DEVELOPMENT it buys something worse: a dynamic import is a lazy
// bundle FETCH from the dev server, and it throws outright when the HMR client
// is not connected -
//
//   Render Error: Expected HMRClient.setup() call at startup.
//     at HMRClient.registerBundle (hmr.ts)
//     at loadBundle.ts
//
// which is what happened on Apple TV: pressing Play raised a red box instead of
// the player, every time the Metro server had dropped. The screen is worth a
// few hundred kilobytes in the initial bundle; it is not worth a playback path
// that depends on a dev server being alive.
//
// See TvQuickConnect for the same trap, hit with the QR code library.

export { TvPlayer } from '#tv/features/playback/TvPlayer';
