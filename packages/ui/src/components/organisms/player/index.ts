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
// NOT `clamp01`: it is the progress atom's, and the kit already exports it. This
// barrel is what `@kroma/ui` re-exports, so listing it here put the same name on
// BOTH entry points - the exact overlap kit.ts says the two must never have. The
// chrome's own files still take it from ./lib/fmt.
export { endsAtClock, pct } from './lib/fmt';
export {
  buildLeanStats,
  type LeanStatsInput,
  type LeanStatsVideoHandle,
} from './lib/lean-stats';
export { SEEK_BAR } from './lib/style';
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
