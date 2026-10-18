// The shared 10-foot experience, as every shell sees it. Renderer-agnostic on
// purpose, so nothing here may import `react-dom`; see `mount.web.tsx`.

export type { BuildInfo } from '#tv/app/buildMetadata';
export type { DeviceNameSource } from '#tv/app/deviceName';
export { lateDeviceName } from '#tv/app/deviceName';
export type { ClientHardware, HardwareSource } from '#tv/app/hardwareReadings';
export type { LauncherBackend } from '#tv/app/launcher';
export { createSearchRequests, type SearchRequests } from '#tv/app/searchRequest';
export type { SearchShell, SearchShellProps } from '#tv/app/searchShell';
export type { AnnouncedServer, ServerBrowse } from '#tv/app/serverBrowse';
export type { TvAppProps } from '#tv/app/TvApp';
export { TvApp } from '#tv/app/TvApp';
export type { VoiceSearchBackend, VoiceSessionProps } from '#tv/app/voiceSearch';
export type { VlcPlaneProps } from '#tv/features/playback/player/vlcPlane';
export { registerVlcPlane } from '#tv/features/playback/player/vlcPlane';
export type { DeepLink } from '#tv/shared/preview';
export { createDeepLinks, type DeepLinks } from '#tv/shared/preview';
