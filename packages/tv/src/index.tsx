// The shared 10-foot experience, as every shell sees it. Renderer-agnostic on
// purpose: the browser shells mount it through `@kroma/tv/mount` (react-dom),
// the native TV client hands `TvApp` to React Native. Nothing here may import
// `react-dom` see the note in `mount.web.tsx`.

// Which build is running, for the About screen. A shell bundled by Vite bakes it
// in as a `define` and never touches this; the Metro-bundled one has no `define`
// and pushes it in instead (see the module).
export type { BuildInfo } from '#tv/app/clientBuild';
export { setBuildInfo } from '#tv/app/clientBuild';
// The rows KROMA publishes OUT to a television's own home screen (Android TV /
// Google TV): only a shell can write them, and only one platform has them.
export type { LauncherBackend } from '#tv/app/launcher';
export { setLauncherBackend } from '#tv/app/launcher';
// A search asked for from outside the app: Siri on Apple TV today, and the door
// any other shell (a paired phone, a launcher tile) would come through.
export { requestSearch } from '#tv/app/searchRequest';
// The search field and keyboard, when the platform's own are the better pair
// (Apple TV, where they are also the only way in for dictation).
export type { SearchShell, SearchShellProps } from '#tv/app/searchShell';
export { setSearchShell } from '#tv/app/searchShell';
// Likewise for hearing the server announce itself: a native DNS-SD browser is
// the one route that finds a server on a non-default port or behind a proxy.
export type { AnnouncedServer, ServerBrowse } from '#tv/app/serverBrowse';
export { setServerBrowse } from '#tv/app/serverBrowse';
export type { TvAppProps } from '#tv/app/TvApp';
export { TvApp } from '#tv/app/TvApp';
// Voice search is a capability only a shell can supply (see the module): the
// native clients register one, the browser shells have none today.
export type { VoiceSearchBackend, VoiceSessionProps } from '#tv/app/voiceSearch';
export { setVoiceSearchBackend } from '#tv/app/voiceSearch';
// A launcher tile the user selected, handed in by a shell that can hear about
// it (React Native's Linking on the native TV app). Tizen reads its own.
export type { DeepLink } from '#tv/shared/preview';
export { requestDeepLink } from '#tv/shared/preview';
