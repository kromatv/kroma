// The SERVICES half of the design system: the hooks and providers, plus the
// player. The components are `@kromatv/ui/kit`.

export * from './components/organisms/player';
export { type DeviceStore, deviceStore, useDeviceStore } from './lib/device-store';
export {
  dispatchRemoteKey,
  type RemoteKey,
  type RemoteKeyHandler,
  type RemoteKeyMap,
  registerTvMediaKeys,
  resolveRemoteKey,
} from './lib/remote-keys';
export { mediaFollowsDirectRoute, withLocalAddressSpace } from './lib/lan-reach';
export { useForeground } from './lib/use-foreground';
export { useAccountStorage } from './services/account-storage';
export type { UseAiSuggestOptions, UseAiSuggestResult } from './services/ai-suggest';
export { useAiSuggest, useEstimatedProgress } from './services/ai-suggest';
export type { ActivateResult, AuthSession } from './services/auth';
export { useAuthSession } from './services/auth';
export type { Cast, CastFailure, CastProviderProps } from './services/cast';
export { CastProvider, useCast } from './services/cast';
export type { DirectConnectionView, DirectPlatform } from './services/direct-connection';
export { useDirectConnection } from './services/direct-connection';
export { type Format, useFormat } from './services/format';
export type { I18nProviderProps } from './services/i18n';
export {
  I18nProvider,
  useI18n,
  useLocale,
  useLocaleDefault,
  useScopedT,
  useSetLocale,
  useT,
} from './services/i18n';
export type { LocaleProviderProps } from './services/locale';
export { LocaleProvider } from './services/locale';
export type { PlaybackHeartbeatParams } from './services/playback';
export { usePlaybackHeartbeat } from './services/playback';
export type { Storyboard, StoryboardTile } from './services/storyboard';
export { useStoryboard } from './services/storyboard';
export type {
  SubtitleGenerationsOptions,
  SubtitleGenerationsResult,
} from './services/subtitle-generations';
export { useSubtitleGenerations } from './services/subtitle-generations';
export type { ThemeAudio } from './services/theme-audio';
export { useThemeAudio } from './services/theme-audio';
export { type UpNext, useUpNext } from './services/up-next';
