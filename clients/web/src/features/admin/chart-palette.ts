import { colors } from '@kroma/ui/tokens/colors';

/**
 * The admin charts' series colours, by role.
 *
 * Token VALUES rather than the custom properties everything else paints with: a
 * series is stroked into an SVG, and a role the reader has learned must survive
 * a series dropping out, which a palette slot assigned by position cannot
 * promise. Roles rather than hues, and never cycled, so a reader who learned
 * that amber is local traffic does not find it repainted.
 */
export const CHART_SERIES = {
  local: colors.accent,
  remote: colors.info,
  kroma: colors.success,
  cpuSystem: colors.danger,
  ramSystem: colors.hdr,
  films: colors.success,
  tv: colors.danger,
} as const;
