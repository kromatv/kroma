// Geometry for the stats panel's live charts.
//
// Pure maths, no React and no SVG element, because the mapping is the part worth
// testing: these charts are the only thing in the player that redraws on a timer,
// and the bug they shipped with lived here rather than in the drawing.
//
// The window is RIGHT-ANCHORED and its step is fixed. The previous version spread
// whatever samples it happened to have across the full width (`step = W / (n-1)`),
// so for the first 40 s of a stream the trace stretched horizontally as history
// accumulated: the line appeared to move because the axis was moving under it,
// which is the one thing a trend chart must never do. Here the newest sample is
// always at the right edge, one sample is always the same number of pixels, and a
// short history simply has not reached the left edge yet.

/** Samples one chart window holds (~40 s at the panel's 2 Hz poll). */
export const CHART_WINDOW = 80;

export interface ChartBox {
  /** Drawable width. `x = width` is the newest sample. */
  width: number;
  height: number;
  /** Vertical inset, so a 2px stroke never clips against the extremes. */
  padY: number;
  /** Samples across the full width. Defaults to CHART_WINDOW. */
  window?: number;
}

export interface Extent {
  min: number;
  max: number;
}

/**
 * The value range every series in one chart shares.
 *
 * Shared deliberately: two series on one axis is the whole reason the bandwidth
 * and bitrate meters can be read against each other, and scaling them
 * independently would invent a crossover that is not in the data. `reference`
 * widens the range so a floor line is never drawn outside the box.
 *
 * A flat series (a stream holding a steady bitrate is the NORMAL case) has no
 * span of its own; it gets a symmetric ±1 so it draws as the level line it is
 * rather than dividing by zero or slamming to an edge.
 */
export function extentOf(series: readonly (readonly number[])[], reference?: number): Extent {
  let { min, max } = spanOf(series);
  // The reference line (the buffer's low-water mark) has to fit inside the
  // scale, or it draws off the chart at exactly the moment it matters.
  if (reference != null && Number.isFinite(reference)) {
    min = Math.min(min, reference);
    max = Math.max(max, reference);
  }
  if (min === Number.POSITIVE_INFINITY) return { min: 0, max: 1 };
  if (max === min) return { min: min - 1, max: max + 1 };
  return { min, max };
}

/** Min and max over every FINITE sample in every series; the infinities survive
 * when there is nothing finite at all, which is what tells the caller apart from
 * a genuine span of zero. */
function spanOf(series: readonly (readonly number[])[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const data of series) {
    for (const v of data) {
      if (!Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  return { min, max };
}

/** Sample index → x. Right-anchored: the newest sample sits at `box.width`. */
export function xAt(index: number, count: number, box: ChartBox): number {
  const window = box.window ?? CHART_WINDOW;
  const step = window > 1 ? box.width / (window - 1) : 0;
  return box.width - (count - 1 - index) * step;
}

/** Value → y. Larger values sit higher, which is why this inverts. */
export function yAt(value: number, extent: Extent, box: ChartBox): number {
  const span = extent.max - extent.min;
  const usable = box.height - box.padY * 2;
  const t = span > 0 ? (value - extent.min) / span : 0.5;
  return box.padY + (1 - t) * usable;
}

/** Quantise to 0.1px: a chart this size cannot show finer, and the shorter
 * numbers keep the `d` string small - which is the thing that actually crosses
 * into the renderer on every tick. */
export function px(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * `d` for one open trace. Empty when there is not yet enough to draw a line -
 * a single sample is a dot's worth of information and reads as a glitch.
 */
export function seriesPath(data: readonly number[], extent: Extent, box: ChartBox): string {
  if (data.length < 2) return '';
  let d = '';
  for (let i = 0; i < data.length; i += 1) {
    const value = Number.isFinite(data[i] as number) ? (data[i] as number) : extent.min;
    d += `${i === 0 ? 'M' : 'L'}${px(xAt(i, data.length, box))} ${px(yAt(value, extent, box))}`;
  }
  return d;
}

/**
 * `d` for the closed band between two traces - the headroom between the
 * bandwidth a connection is delivering and the bitrate the stream is asking for.
 *
 * The band is the diagnostic: while it is open there is slack, and when it
 * closes the stream is about to stall. Drawing it as a filled region says that
 * in one glance, where two separate auto-scaled sparklines said nothing at all.
 */
export function bandPath(
  upper: readonly number[],
  lower: readonly number[],
  extent: Extent,
  box: ChartBox,
): string {
  const n = Math.min(upper.length, lower.length);
  if (n < 2) return '';
  let d = '';
  for (let i = 0; i < n; i += 1) {
    d += `${i === 0 ? 'M' : 'L'}${px(xAt(i, n, box))} ${px(yAt(upper[i] as number, extent, box))}`;
  }
  // Back along the lower trace, right to left, and close.
  for (let i = n - 1; i >= 0; i -= 1) {
    d += `L${px(xAt(i, n, box))} ${px(yAt(lower[i] as number, extent, box))}`;
  }
  return `${d}Z`;
}

/** Where the newest sample landed, for the "now" end dot. Null when there is
 * nothing drawn to anchor it to. */
export function endPoint(
  data: readonly number[],
  extent: Extent,
  box: ChartBox,
): { x: number; y: number } | null {
  if (data.length < 2) return null;
  const last = data.at(-1) as number;
  return {
    x: px(xAt(data.length - 1, data.length, box)),
    y: px(yAt(Number.isFinite(last) ? last : extent.min, extent, box)),
  };
}
