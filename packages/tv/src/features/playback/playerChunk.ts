// The player, on the native targets: loaded with everything else.
//
// Metro does not code-split a production bundle, so `import()` buys nothing
// there. In development it's worse: a dynamic import is a lazy bundle fetch
// from the dev server, and throws outright when the HMR client isn't
// connected ("Render Error: Expected HMRClient.setup() call at startup"),
// which raised a red box on Apple TV instead of the player every time the
// Metro server had dropped. Not worth it for a few hundred kilobytes.
//
// See TvQuickConnect for the same trap, hit with the QR code library.

export { TvPlayer } from '#tv/features/playback/TvPlayer';
