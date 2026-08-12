// One player chrome for web + TV. Styled with Tailwind, legacy-safe: flex only,
// no /opacity (see ./tw).

export {
  AUDIO_FILTER_KEY,
  audioFilterLabels,
  storedAudioFilter,
  useAudioFilter,
} from './lib/audio-filter';
export { currentChapter, currentChapterIndex, normalizeChapters } from './lib/chapters';
// NOT `clamp01`: the kit already exports it, and `@kroma/ui` re-exports this
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
export type { CreditsCardItem } from './parts/credits-card';
export type { SubtitleGenBundle, SubtitleGenRequest } from './parts/settings-panel/settings/gen';
export { StatsPanel } from './parts/stats-panel';
export type { SurfaceRadius } from './parts/surface-radius';
export { SurfaceRadiusProvider, useSurfaceRadius } from './parts/surface-radius';
// The width the sheet draws a card at, so a host asks for artwork that size.
export { UP_NEXT_ART_W } from './parts/up-next-card';
export type { UpNextData, UpNextItem } from './parts/up-next-sheet';
export type { PlayerRootProps } from './player';
export { Player } from './player';
export type { PlayerActionsProps, PlayerMediaProps, PlayerPanelProps } from './player-parts';
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
