// Samsung Tizen "Smart Hub Preview" integration: even with the app not
// running, Samsung can expand the focused KROMA tile into a carousel of
// content tiles, deep-linking into playback when one is selected.
//
//   • tizen.ts     the minimal Tizen typings + the `tizen` feature-detect
//   • cards.ts     building the carousel tile JSON from the live catalog
//   • service.ts   persisting that JSON + nudging the background service
//   • deeplink.ts  decoding the tile selection that launched/targeted the app
//
// Everything is feature-detected against the `tizen` global, so it is a no-op
// on webOS and in the browser dev server.

export { onDeepLink, readDeepLink, requestDeepLink } from '#tv/shared/preview/deeplink';
export { publishPreview } from '#tv/shared/preview/service';
export type { DeepLink } from '#tv/shared/preview/types';
