// @kroma/ui: the SERVICES half of the design system - the hooks and providers
// that talk to the server or hold app state - plus the player, whose props are
// those services' own types. The components are `@kroma/ui/kit`; see kit.ts for
// why the two are disjoint and how that is (not) enforced.

export * from './components/organisms/player';
export type { UseAiSuggestOptions, UseAiSuggestResult } from './services/aiSuggest';
export { useAiSuggest } from './services/aiSuggest';
export type { ActivateResult, AuthSession } from './services/auth';
export { useAuthSession } from './services/auth';
export type { Cast, CastProviderProps } from './services/cast';
export { CastProvider, useCast } from './services/cast';
export type { I18nProviderProps } from './services/i18n';
export { I18nProvider, useLocale, useSetLocale, useT } from './services/i18n';
export type { LocaleProviderProps } from './services/locale';
export { LocaleProvider } from './services/locale';
export type { PlaybackHeartbeatParams } from './services/playback';
export { usePlaybackHeartbeat } from './services/playback';
export type { Storyboard, StoryboardTile } from './services/storyboard';
export { useStoryboard } from './services/storyboard';
export type {
  SubtitleGenerationsOptions,
  SubtitleGenerationsResult,
} from './services/subtitleGenerations';
export { useSubtitleGenerations } from './services/subtitleGenerations';
export type { ThemeAudio } from './services/themeAudio';
export { useThemeAudio } from './services/themeAudio';
