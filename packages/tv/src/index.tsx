// The shared 10-foot experience, as every shell sees it. Renderer-agnostic on
// purpose, so nothing here may import `react-dom` — see `mount.web.tsx`.

export type { BuildInfo } from '#tv/app/clientBuild';
export { setBuildInfo } from '#tv/app/clientBuild';
export type { LauncherBackend } from '#tv/app/launcher';
export { setLauncherBackend } from '#tv/app/launcher';
export { requestSearch } from '#tv/app/searchRequest';
export type { SearchShell, SearchShellProps } from '#tv/app/searchShell';
export { setSearchShell } from '#tv/app/searchShell';
export type { AnnouncedServer, ServerBrowse } from '#tv/app/serverBrowse';
export { setServerBrowse } from '#tv/app/serverBrowse';
export type { TvAppProps } from '#tv/app/TvApp';
export { TvApp } from '#tv/app/TvApp';
export type { VoiceSearchBackend, VoiceSessionProps } from '#tv/app/voiceSearch';
export { setVoiceSearchBackend } from '#tv/app/voiceSearch';
export type { DeepLink } from '#tv/shared/preview';
export { requestDeepLink } from '#tv/shared/preview';
