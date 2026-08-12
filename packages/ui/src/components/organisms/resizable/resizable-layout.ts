// The arithmetic behind a resizable group: what each panel is allowed to be,
// and where the panels land once a seam between two of them has moved.
//
// The layout is a list of PERCENTAGES that sums to 100, for the reason a
// dragged panel has to survive a window: a share of the group is still the
// same wish on a laptop, where the same number of points would have been
// trimmed to fit and never grow back. Points are accepted at the edges
// (`'280px'`) and resolved against the group's measured length on the way in,
// so a caller states the minimum its contents actually need.
//
// Every function here is pure, so the whole of a group's behaviour is testable
// without a renderer and identical on a television and in a browser.

/** A panel measurement: a share of the group (`25`) or points (`'280px'`). */
type ResizableSize = number | `${number}px`;

/** What a `<Resizable.Panel>` declares about its own bounds. */
interface PanelSpec {
  defaultSize?: ResizableSize;
  minSize?: ResizableSize;
  maxSize?: ResizableSize;
  collapsible?: boolean;
  collapsedSize?: ResizableSize;
}

/** A panel's bounds, resolved against the group's measured length. */
interface PanelLimit {
  min: number;
  max: number;
  collapsedSize: number;
  collapsible: boolean;
}

const FULL = 100;

// Percentages carry three decimals, which is a tenth of a point on a 4K stage
// and far below anything Yoga can lay out. Rounding at every step is what keeps
// a hundred small drags from drifting the sum away from 100.
const PLACES = 1000;
const EPSILON = 0.001;

const total = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number): number => Math.round(value * PLACES) / PLACES;

/** A stated size as a share of `available` points, or nothing where it cannot
 * be resolved yet - a points size before the group has been measured. */
function percentOf(size: ResizableSize | undefined, available: number): number | undefined {
  if (size === undefined) return undefined;
  if (typeof size === 'number') return Number.isFinite(size) ? clamp(size, 0, FULL) : undefined;
  const points = Number.parseFloat(size);
  if (!Number.isFinite(points) || available <= 0) return undefined;
  return clamp((points / available) * FULL, 0, FULL);
}

/** A share of the group back in points. */
function pointsOf(percent: number, available: number): number {
  return Math.round((percent / FULL) * available);
}

/** The bounds every panel is held to on a group this long. */
function limitsFor(specs: readonly PanelSpec[], available: number): PanelLimit[] {
  return specs.map((spec) => {
    const collapsible = spec.collapsible === true;
    const min = percentOf(spec.minSize, available) ?? 0;
    const max = Math.max(min, percentOf(spec.maxSize, available) ?? FULL);
    const shut = collapsible ? clamp(percentOf(spec.collapsedSize, available) ?? 0, 0, min) : min;
    return { min, max, collapsible, collapsedSize: shut };
  });
}

/** The layout a group opens at: every panel that states a `defaultSize` takes
 * it, and the panels that state none split what is left equally. */
function defaultLayout(specs: readonly PanelSpec[], available: number): number[] {
  const stated = specs.map((spec) => percentOf(spec.defaultSize, available));
  const free = Math.max(0, FULL - total(stated.filter((size) => size !== undefined)));
  const open = stated.filter((size) => size === undefined).length;
  const share = open > 0 ? free / open : 0;
  return stated.map((size) => size ?? share);
}

const floorOf = (limit: PanelLimit): number =>
  limit.collapsible ? limit.collapsedSize : limit.min;

/** Whether a panel is shut rather than merely small. */
function collapsedAt(size: number, limit: PanelLimit): boolean {
  return limit.collapsible && size <= limit.collapsedSize + EPSILON;
}

// A collapsible panel has a dead zone between shut and its floor that no layout
// may rest in: a drag through it settles to whichever end it is nearer, which
// is what makes the panel snap shut rather than dissolve.
function settle(size: number, limit: PanelLimit): number {
  const capped = Math.min(size, limit.max);
  if (!limit.collapsible) return Math.max(capped, limit.min);
  if (capped >= limit.min) return capped;
  return capped <= (limit.collapsedSize + limit.min) / 2 ? limit.collapsedSize : limit.min;
}

// The room a panel offers to REDISTRIBUTION rather than to a drag. A
// collapsible panel is shut by a gesture and never by arithmetic: a shut one is
// frozen, and an open one gives no more than its own floor, so re-clamping the
// group to a new window can neither open a panel behind the reader nor leave
// one resting in a dead zone the same pass has just lifted it out of.
const growRoom = (size: number, limit: PanelLimit): number =>
  collapsedAt(size, limit) ? 0 : Math.max(0, limit.max - size);

const shrinkRoom = (size: number, limit: PanelLimit): number =>
  collapsedAt(size, limit) ? 0 : Math.max(0, size - limit.min);

// What a drag may take, which is the whole of it: this is the one way a panel
// gets shut, and the one way a shut one comes back.
const dragRoom = (size: number, limit: PanelLimit, way: 'grow' | 'shrink'): number =>
  way === 'grow' ? Math.max(0, limit.max - size) : Math.max(0, size - floorOf(limit));

// Whatever the clamping left over, spread across the panels in proportion to
// the room each still has. Proportional rather than nearest-first so a window
// narrowing takes a little from every panel instead of flattening the first.
function normalise(sizes: readonly number[], limits: readonly PanelLimit[]): number[] {
  const drift = FULL - total(sizes);
  if (Math.abs(drift) < EPSILON) return [...sizes];
  const room = sizes.map((size, at) => {
    const limit = limits[at];
    if (!limit) return 0;
    return drift > 0 ? growRoom(size, limit) : shrinkRoom(size, limit);
  });
  const spare = total(room);
  if (spare < EPSILON) return [...sizes];
  const moved = Math.min(Math.abs(drift), spare) * Math.sign(drift);
  return sizes.map((size, at) => size + (moved * (room[at] as number)) / spare);
}

/** A wished-for layout made legal on this group: every panel inside its own
 * bounds, nothing resting in a collapsible panel's dead zone, and the whole
 * summing to 100 again. */
function solve(sizes: readonly number[], limits: readonly PanelLimit[]): number[] {
  const settled = sizes.map((size, at) => {
    const limit = limits[at];
    return limit ? settle(size, limit) : size;
  });
  return normalise(settled, limits).map(round);
}

function order(from: number, to: number): number[] {
  const step = from <= to ? 1 : -1;
  const count = Math.abs(to - from) + 1;
  const out: number[] = new Array(count);
  for (let i = 0; i < count; i += 1) out[i] = from + i * step;
  return out;
}

function capacity(
  sizes: readonly number[],
  limits: readonly PanelLimit[],
  indices: readonly number[],
  way: 'grow' | 'shrink',
): number {
  return total(
    indices.map((at) => {
      const limit = limits[at];
      const size = sizes[at];
      return limit && size !== undefined ? dragRoom(size, limit, way) : 0;
    }),
  );
}

function spend(
  sizes: number[],
  limits: readonly PanelLimit[],
  indices: readonly number[],
  amount: number,
  way: 'grow' | 'shrink',
): void {
  let left = amount;
  for (const at of indices) {
    if (left < EPSILON) return;
    const limit = limits[at] as PanelLimit;
    const size = sizes[at] as number;
    const take = Math.min(left, dragRoom(size, limit, way));
    sizes[at] = way === 'grow' ? size + take : size - take;
    left -= take;
  }
}

/**
 * The layout after the seam between panel `at` and panel `at + 1` has moved by
 * `delta` percent. Positive grows the panel before the seam.
 *
 * The panels nearest the seam move first and the ones beyond them take over as
 * each hits a bound, so a seam keeps travelling as long as anything on either
 * side still has room.
 */
function adjust(
  layout: readonly number[],
  at: number,
  delta: number,
  limits: readonly PanelLimit[],
): number[] {
  const last = layout.length - 1;
  if (!Number.isFinite(delta) || Math.abs(delta) < EPSILON) return [...layout];
  if (at < 0 || at >= last) return [...layout];

  const forward = delta > 0;
  const grow = forward ? order(at, 0) : order(at + 1, last);
  const shrink = forward ? order(at + 1, last) : order(at, 0);
  const room = Math.min(
    Math.abs(delta),
    capacity(layout, limits, grow, 'grow'),
    capacity(layout, limits, shrink, 'shrink'),
  );
  if (room < EPSILON) return [...layout];

  const out = [...layout];
  spend(out, limits, shrink, room, 'shrink');
  spend(out, limits, grow, room, 'grow');
  return solve(out, limits);
}

/** The layout after panel `at` has been asked for a size outright, the seam
 * beside it doing the work a drag would have done. */
function resizePanel(
  layout: readonly number[],
  at: number,
  size: number,
  limits: readonly PanelLimit[],
): number[] {
  const current = layout[at];
  if (current === undefined || layout.length < 2) return [...layout];
  const delta = size - current;
  return at < layout.length - 1
    ? adjust(layout, at, delta, limits)
    : adjust(layout, at - 1, -delta, limits);
}

/** The two panels a seam separates put back in the proportion their own
 * `defaultSize`s asked for, leaving every other panel where the reader left
 * it. */
function resetSeam(
  layout: readonly number[],
  at: number,
  defaults: readonly number[],
  limits: readonly PanelLimit[],
): number[] {
  const before = layout[at];
  const after = layout[at + 1];
  const wantedBefore = defaults[at];
  const wantedAfter = defaults[at + 1];
  if (before === undefined || after === undefined) return [...layout];
  if (wantedBefore === undefined || wantedAfter === undefined) return [...layout];
  const share = wantedBefore + wantedAfter;
  if (share < EPSILON) return [...layout];
  const out = [...layout];
  out[at] = ((before + after) * wantedBefore) / share;
  out[at + 1] = before + after - out[at];
  return solve(out, limits);
}

/** Whether two layouts say the same thing, to the precision `solve` rounds to. */
function sameLayout(a: readonly number[], b: readonly number[]): boolean {
  return (
    a.length === b.length && a.every((size, at) => Math.abs(size - (b[at] as number)) < EPSILON)
  );
}

export type { PanelLimit, PanelSpec, ResizableSize };
export {
  adjust,
  collapsedAt,
  defaultLayout,
  EPSILON,
  FULL,
  limitsFor,
  percentOf,
  pointsOf,
  resetSeam,
  resizePanel,
  sameLayout,
  solve,
};
