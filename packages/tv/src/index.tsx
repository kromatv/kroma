// The shared 10-foot experience, as every shell sees it. Renderer-agnostic on
// purpose, so nothing here may import `react-dom`; see `mount.web.tsx`.

export type { BuildInfo } from '#tv/app/build-metadata';
export type { DeviceNameSource } from '#tv/app/device-name';
export { lateDeviceName } from '#tv/app/device-name';
export type { ClientHardware, HardwareSource } from '#tv/app/hardware-readings';
export type { LauncherBackend } from '#tv/app/launcher';
export { createSearchRequests, type SearchRequests } from '#tv/app/search-request';
export type { SearchShell, SearchShellProps } from '#tv/app/search-shell';
export type { AnnouncedServer, ServerBrowse } from '#tv/app/server-browse';
export type { TvAppProps } from '#tv/app/tv-app';
export { TvApp } from '#tv/app/tv-app';
export type { VoiceSearchBackend, VoiceSessionProps } from '#tv/app/voice-search';
export type { VlcPlaneProps } from '#tv/features/playback/player/vlc-plane';
export type { DeepLink } from '#tv/shared/preview';
export { createDeepLinks, type DeepLinks } from '#tv/shared/preview';
