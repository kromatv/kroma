// Unified player (§14): ONE chrome for web + TV, styled with Tailwind (both
// clients @source this dir; legacy-safe flex-only + no /opacity, see ./tw).
// Barrel for the public surface consumed by the web + TV wrappers.

export {
  AUDIO_FILTER_KEY,
  audioFilterLabels,
  storedAudioFilter,
  useAudioFilter,
} from './lib/audio-filter';
export { currentChapter, currentChapterIndex, normalizeChapters } from './lib/chapters';
export { clamp01, endsAtClock, pct } from './lib/fmt';
export {
  buildLeanStats,
  type LeanStatsInput,
  type LeanStatsVideoHandle,
} from './lib/lean-stats';
export { SEEK_BAR } from './lib/style';
export {
  DEFAULT_SUB_APPEARANCE,
  SUB_COLORS,
  type SubEdge,
  type SubFont,
  type SubSize,
  type SubtitleAppearance,
  subtitleStyle,
  useSubtitleAppearance,
} from './lib/subtitle-appearance';
export type { PlayerProps } from './Player';
export { Player } from './Player';
export type { CreditsCardItem } from './parts/CreditsCard';
export { StatsPanel } from './parts/StatsPanel';
export type { SubtitleGenBundle, SubtitleGenRequest } from './parts/settings/gen';
export type { SurfaceRadius } from './parts/surface-radius';
export { SurfaceRadiusProvider, useSurfaceRadius } from './parts/surface-radius';
export type { UpNextData, UpNextItem } from './parts/UpNextSheet';
export type {
  AudioFilterMode,
  Chapter,
  PlaneRect,
  PlayerController,
  PlayerFlags,
  PlayerMeter,
  PlayerQuality,
  PlayerStats,
  PlayerSub,
  PlayerSurface,
} from './types';
export { TV_FLAGS, WEB_FLAGS } from './types';
