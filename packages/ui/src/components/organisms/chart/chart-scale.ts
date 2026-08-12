// The geometry behind <Chart>: pure maths, no React and no SVG, so the scales
// are unit-tested rather than eyeballed. Every function here is total - empty,
// single-point and flat data all produce a drawable box rather than a NaN.

/** One sample. A series reads its own field off it; anything not a finite
 *  number is a gap. */
export type ChartPoint = Record<string, number | string | null | undefined>;

/** The value range a plot is drawn against. `max` is always greater than
 *  `min`, which is what makes every division below safe. */
export interface ChartDomain {
  min: number;
  max: number;
}

export interface ChartBox {
  width: number;
  height: number;
}

export interface DomainOptions {
  min?: number;
  max?: number;
  /** Pull 0 into the range, for a mark measured from a baseline. */
  baseline?: boolean;
}

export interface ChartBand {
  x: number;
  width: number;
}

/** The share of a band one bar occupies; the rest is the gap between them. */
const BAR_FILL = 0.62;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/** A point's value for one series, or null where there is nothing to draw. */
export function valueFor(point: ChartPoint | undefined, series: string): number | null {
  const raw = point?.[series];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** The column one series contributes, in point order. */
export function columnOf(data: readonly ChartPoint[], series: string): (number | null)[] {
  return data.map((point) => valueFor(point, series));
}

/**
 * The range every series in one chart shares, so two series are read against
 * each other rather than each against its own scale.
 *
 * `min`/`max` win outright, and an inverted pair is widened rather than
 * rejected. Otherwise a flat run is opened out: to `0..1` when it sits on zero
 * or is measured from a baseline, and symmetrically by 1 when it does not, so a
 * dead metric draws along the floor instead of dividing by zero.
 */
export function domainOf(
  columns: readonly (readonly (number | null)[])[],
  options: Readonly<DomainOptions> = {},
): ChartDomain {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const column of columns) {
    for (const value of column) {
      if (value === null) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (options.baseline) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  const spread = widened({ min, max }, Boolean(options.baseline));
  return stated(spread, options);
}

// A domain with no width cannot be divided by. Nothing finite seen at all reads
// as 0..1; a flat run opens around the value it rests at, or up from the floor
// where the floor is part of the reading.
function widened(at: ChartDomain, baseline: boolean): ChartDomain {
  if (!Number.isFinite(at.min) || !Number.isFinite(at.max)) return { min: 0, max: 1 };
  if (at.min !== at.max) return at;
  if (baseline || at.min === 0) {
    const min = Math.min(at.min, 0);
    return { min, max: Math.max(at.max, min + 1) };
  }
  return { min: at.min - 1, max: at.max + 1 };
}

// What the caller asked for wins over what the data says, and the result is
// still a range rather than a point.
function stated(at: ChartDomain, options: Readonly<DomainOptions>): ChartDomain {
  const min = options.min !== undefined && Number.isFinite(options.min) ? options.min : at.min;
  const max = options.max !== undefined && Number.isFinite(options.max) ? options.max : at.max;
  return { min, max: max <= min ? min + 1 : max };
}

/** Sample index to x, first sample on the left edge and last on the right. A
 *  lone sample sits in the middle, where a division would otherwise be by zero. */
export function xAt(index: number, count: number, width: number): number {
  if (count <= 1) return width / 2;
  return (index / (count - 1)) * width;
}

/** The slice of the plot one sample owns, and the bar drawn inside it. */
export function bandAt(index: number, count: number, width: number): ChartBand {
  if (count <= 0) return { x: 0, width };
  const slot = width / count;
  const bar = Math.max(1, slot * BAR_FILL);
  return { x: slot * index + (slot - bar) / 2, width: bar };
}

/** Value to y. Larger values sit higher, which is why this inverts; a value
 *  outside an explicit domain is clamped to the edge rather than drawn off it. */
export function yAt(value: number, domain: ChartDomain, box: ChartBox): number {
  const span = domain.max - domain.min;
  return (1 - clamp01((value - domain.min) / span)) * box.height;
}

/** The level a baselined mark is measured from: zero, or the nearer edge of a
 *  domain that does not contain it. */
export function baselineOf(domain: ChartDomain): number {
  return Math.min(Math.max(0, domain.min), domain.max);
}

/** Quantise to 0.1px: finer is invisible at this size, and the shorter `d` is
 *  what crosses into the renderer on every repaint. */
export function px(value: number): number {
  return Math.round(value * 10) / 10;
}

/** `count` evenly spaced levels across the domain, both ends included. */
export function ticksOf(domain: ChartDomain, count: number): number[] {
  if (count < 2) return [domain.min];
  const span = domain.max - domain.min;
  return Array.from({ length: count }, (_, at) => domain.min + (span * at) / (count - 1));
}

/** Which sample an x lands on, for the cursor. Null where there is nothing to
 *  land on. `band` picks the slice a bar owns rather than the nearest point. */
export function indexAtX(x: number, count: number, width: number, band = false): number | null {
  if (count <= 0 || width <= 0) return null;
  const ratio = clamp01(x / width);
  if (band) return Math.min(count - 1, Math.floor(ratio * count));
  return Math.round(ratio * (count - 1));
}

export interface BarBox {
  x: number;
  width: number;
  y: number;
  height: number;
}

/** The corners a bar rounds, in px. */
export interface BarCorners {
  top: number;
  bottom: number;
}

/**
 * One bar as a path, rounding only the corners it is given.
 *
 * The radius belongs to the STACK and not to the segment: a join between two
 * segments that both rounded would pinch, showing the ground through the notch
 * and reading as two bars that happen to touch. A radius larger than the box
 * can hold is clamped rather than allowed to deform it.
 */
export function barPath(box: Readonly<BarBox>, corners: Readonly<BarCorners>): string {
  const limit = Math.max(0, Math.min(box.width / 2, box.height / 2));
  const top = Math.max(0, Math.min(corners.top, limit));
  const bottom = Math.max(0, Math.min(corners.bottom, limit));
  const right = box.x + box.width;
  const foot = box.y + box.height;
  const arc = (cx: number, cy: number, x: number, y: number) =>
    `Q${px(cx)} ${px(cy)},${px(x)} ${px(y)}`;

  let d = `M${px(box.x)} ${px(box.y + top)}`;
  if (top > 0) d += arc(box.x, box.y, box.x + top, box.y);
  d += `L${px(right - top)} ${px(box.y)}`;
  if (top > 0) d += arc(right, box.y, right, box.y + top);
  d += `L${px(right)} ${px(foot - bottom)}`;
  if (bottom > 0) d += arc(right, foot, right - bottom, foot);
  d += `L${px(box.x + bottom)} ${px(foot)}`;
  if (bottom > 0) d += arc(box.x, foot, box.x, foot - bottom);
  return `${d}Z`;
}

/**
 * Where each bar in a stack starts, given the columns declared before it.
 * Values are summed as drawn, so a gap contributes nothing and does not sink
 * the bars above it.
 */
export function stackBase(below: readonly (readonly (number | null)[])[], count: number): number[] {
  const base = new Array<number>(count).fill(0);
  for (const column of below) {
    for (let at = 0; at < count; at += 1) base[at] = (base[at] as number) + (column[at] ?? 0);
  }
  return base;
}
