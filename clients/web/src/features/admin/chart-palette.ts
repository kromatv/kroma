import { colors, withAlpha } from '@kroma/ui/tokens/colors';

/**
 * The admin charts' series colours, by role.
 *
 * The one place in the admin that reads token VALUES rather than the custom
 * properties everything else paints with: Chart.js draws on a canvas, where a
 * `var()` never resolves. Roles rather than hues, and never cycled, so a reader
 * who learned that amber is local traffic does not find it repainted.
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

/** The chart chrome: axes, grid and tooltip, on the same canvas and under the
 *  same constraint as {@link CHART_SERIES}. */
export const CHART_INK = {
  tick: colors.glyphDim,
  tickNow: colors.glyph,
  grid: withAlpha(colors.tint, 0.05),
  point: colors.tint,
  tooltipBg: withAlpha(colors.surface1, 0.95),
  tooltipBorder: withAlpha(colors.tint, 0.1),
  tooltipTitle: colors.glyph,
  tooltipBody: colors.text,
} as const;
