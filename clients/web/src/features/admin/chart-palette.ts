import type { WatchKind } from '@kromatv/client/admin';
import { colors } from '@kromatv/ui/tokens/colors';

/**
 * Token VALUES rather than the custom properties everything else paints with:
 * a series is stroked into an SVG.
 */
export const CHART_SERIES = {
  local: colors.accent,
  remote: colors.info,
  kroma: colors.success,
  cpuMedia: colors.accent,
  cpuSystem: colors.danger,
  ramSystem: colors.hdr,
} as const;

export const KIND_SERIES = {
  movie: colors.success,
  tv: colors.danger,
} as const satisfies Record<WatchKind, string>;
