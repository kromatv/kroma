// One player chrome for web + TV. Styled with Tailwind, legacy-safe: flex only,
// no /opacity (see ./tw).

export type { ArrivalPlayerProps } from './arrival-player';
export { ArrivalPlayer } from './arrival-player';
export { PLAYER_ROOT_ID } from './hooks/use-idle-cursor';
export { RESUME_WINDOW, type ResumeNotice, useResumeNotice } from './hooks/use-resume-notice';
export {
  useWatchUpNext,
  type WatchUpNextParams,
  type WatchUpNextParts,
} from './hooks/use-watch-up-next';
export { THROUGHPUT_CHART, withArrivalStats } from './lib/arrival-stats';
export { arrivalSubtitles } from './lib/arrival-subtitles';
export {
  AUDIO_FILTER_KEY,
  audioFilterLabels,
  storedAudioFilter,
  useAudioFilter,
} from './lib/audio-filter';
export { currentChapter, currentChapterIndex, normalizeChapters } from './lib/chapters';
// NOT `clamp01`: the kit already exports it, and `@kromatv/ui` re-exports this
// barrel, so listing it here puts the same name on both entry points.
export { endsAtClock, pct } from './lib/fmt';
export {
  buildLeanStats,
  type LeanStatsInput,
  type LeanStatsVideoHandle,
} from './lib/lean-stats';
export { type SeekBarPaint, seekBar } from './lib/style';
export {
  DEFAULT_SUB_APPEARANCE,
  migrateAppearance,
  SUB_COLORS,
  SUB_EDGES,
  SUB_FONTS,
  type SubEdge,
  type SubFont,
  type SubSize,
  type SubtitleAppearance,
  subtitleStyle,
  subtitleWindowStyle,
  useSubtitleAppearance,
  withOpacity,
} from './lib/subtitle-appearance';
export { keepWatchPosition, useRememberWatchPosition, watchResumeAt } from './lib/watch-resume';
export type {
  PlayerAudioTrack,
  PlayerMarker,
  PlayerReportCategory,
  PlayerStatsItem,
  PlayerSubCapabilities,
  PlayerSubtitleGeneration,
  PlayerVideoTrack,
} from './media-types';
export type { CreditsCardItem } from './parts/credits-card';
export { BACK_10_ICON, FWD_10_ICON } from './parts/icons';
// The width the end-of-film hero is drawn at, so a host asks for art that size.
export { POST_PLAY_ART_W, type PostPlayItem } from './parts/post-play';
export { ResumePrompt, type ResumePromptProps } from './parts/resume-prompt';
export type { SubtitleGenBundle, SubtitleGenRequest } from './parts/settings-panel/settings/gen';
export { PICTURE_ID as PLAYER_PICTURE_ID, STAGE_ID as PLAYER_STAGE_ID } from './parts/stage/stage';
export { StatsPanel } from './parts/stats-panel';
export { SUBTITLE_LAYER_ID as PLAYER_SUBTITLE_ID } from './parts/subtitle-renderer/subtitle-renderer';
export type { SurfaceRadius } from './parts/surface-radius';
export { SurfaceRadiusProvider, useSurfaceRadius } from './parts/surface-radius';
// The width the sheet draws a card at, so a host asks for artwork that size.
export { UP_NEXT_ART_W } from './parts/up-next-card';
export type { UpNextData, UpNextItem } from './parts/up-next-sheet';
export type { PlayerRootProps } from './player';
export { Player } from './player';
export type {
  PlayerActionsProps,
  PlayerArrivalProps,
  PlayerMediaProps,
  PlayerPanelProps,
} from './player-parts';
export type {
  AudioFilterMode,
  Chapter,
  PlaneRect,
  PlayerCloseDetails,
  PlayerCloseReason,
  PlayerController,
  PlayerFlags,
  PlayerMeter,
  PlayerQuality,
  PlayerStats,
  PlayerSub,
  PlayerSurface,
} from './types';
export { TV_FLAGS, WEB_FLAGS } from './types';
