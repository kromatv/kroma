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
export { useForeground } from './lib/use-foreground.hook';
export { useAccountStorage } from './services/account-storage.hook';
export type { UseAiSuggestOptions, UseAiSuggestResult } from './services/ai-suggest.hook';
export { useAiSuggest, useEstimatedProgress } from './services/ai-suggest.hook';
export type { ActivateResult, AuthSession } from './services/auth.hook';
export { useAuthSession } from './services/auth.hook';
export type { Cast, CastFailure, CastProviderProps, CastRowState } from './services/cast';
export { CastProvider, castRowDetail, castRowState, useCast } from './services/cast';
export { useCastPosition } from './services/cast-position.hook';
export type { DirectConnectionView, DirectPlatform } from './services/direct-connection.hook';
export { useDirectConnection } from './services/direct-connection.hook';
export { type Format, useFormat } from './services/format.hook';
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
export type { LocaleProviderProps } from './services/locale.component';
export { LocaleProvider } from './services/locale.component';
export type { PlaybackHeartbeatParams } from './services/playback.hook';
export { usePlaybackHeartbeat } from './services/playback.hook';
export type { Storyboard, StoryboardTile } from './services/storyboard.hook';
export { useStoryboard } from './services/storyboard.hook';
export type {
  SubtitleGenerationsOptions,
  SubtitleGenerationsResult,
} from './services/subtitle-generations.hook';
export { useSubtitleGenerations } from './services/subtitle-generations.hook';
export type { ThemeAudio } from './services/theme-audio.hook';
export { useThemeAudio } from './services/theme-audio.hook';
export { type UpNext, useUpNext } from './services/up-next.hook';
