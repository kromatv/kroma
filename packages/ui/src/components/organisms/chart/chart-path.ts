// How a trace gets from one sample to the next, and the two shapes a mark draws
// from that: the open trace, and the same trace closed to the baseline.
//
// The smoothing is a monotone cubic (Fritsch-Carlson, ACM TOMS 1980) rather than
// a Catmull-Rom or a naive bezier, and that is the whole point: a Catmull-Rom
// overshoots, so a metric resting at 0.0 between two samples dips BELOW zero and
// the curve says something the data never did.

import { baselineOf, type ChartBox, type ChartDomain, px, xAt, yAt } from './chart-scale';

/** The line drawn between two samples. */
export type ChartCurve = 'linear' | 'monotone' | 'step';

interface Point {
  x: number;
  y: number;
}

interface Segment {
  from: number;
  to: number;
}

// Fritsch-Carlson's limit on how steep a tangent may be before the cubic it
// belongs to can leave the range of the two samples it joins.
const OVERSHOOT = 9;

function segmentsOf(column: readonly (number | null)[]): Segment[] {
  const runs: Segment[] = [];
  let from = -1;
  for (let at = 0; at < column.length; at += 1) {
    if (column[at] === null) {
      if (from !== -1) runs.push({ from, to: at - 1 });
      from = -1;
    } else if (from === -1) {
      from = at;
    }
  }
  if (from !== -1) runs.push({ from, to: column.length - 1 });
  return runs;
}

function pointsOf(
  column: readonly (number | null)[],
  segment: Segment,
  domain: ChartDomain,
  box: ChartBox,
): Point[] {
  const points: Point[] = [];
  for (let at = segment.from; at <= segment.to; at += 1) {
    points.push({
      x: xAt(at, column.length, box.width),
      y: yAt(column[at] as number, domain, box),
    });
  }
  return points;
}

/**
 * The Fritsch-Carlson tangent at each sample: the slope a monotone cubic leaves
 * and enters it with.
 *
 * Two properties earn it. A flat run gets zero tangents, so a series resting at
 * one value draws a straight line rather than rippling around it; and a run that
 * only rises has every tangent limited to three times the local secant, which is
 * exactly the condition under which the cubic stays inside the two samples it
 * joins.
 */
export function tangentsOf(points: readonly Point[]): number[] {
  const count = points.length;
  if (count < 2) return new Array<number>(count).fill(0);

  const secants: number[] = [];
  for (let at = 0; at < count - 1; at += 1) {
    const here = points[at] as Point;
    const next = points[at + 1] as Point;
    const run = next.x - here.x;
    secants.push(run === 0 ? 0 : (next.y - here.y) / run);
  }

  const tangents = new Array<number>(count);
  tangents[0] = secants[0] as number;
  tangents[count - 1] = secants[count - 2] as number;
  for (let at = 1; at < count - 1; at += 1) {
    const before = secants[at - 1] as number;
    const after = secants[at] as number;
    // A local peak or trough gets a flat tangent, or the curve rounds over the
    // top of it and invents a value no sample reached.
    tangents[at] = before * after <= 0 ? 0 : (before + after) / 2;
  }

  for (let at = 0; at < count - 1; at += 1) {
    const secant = secants[at] as number;
    if (secant === 0) {
      tangents[at] = 0;
      tangents[at + 1] = 0;
      continue;
    }
    const enter = (tangents[at] as number) / secant;
    const leave = (tangents[at + 1] as number) / secant;
    const reach = enter * enter + leave * leave;
    if (reach > OVERSHOOT) {
      const scale = 3 / Math.sqrt(reach);
      tangents[at] = scale * enter * secant;
      tangents[at + 1] = scale * leave * secant;
    }
  }
  return tangents;
}

function monotoneOf(points: readonly Point[]): string {
  const tangents = tangentsOf(points);
  let d = '';
  for (let at = 0; at < points.length - 1; at += 1) {
    const here = points[at] as Point;
    const next = points[at + 1] as Point;
    const third = (next.x - here.x) / 3;
    const enter = here.y + (tangents[at] as number) * third;
    const leave = next.y - (tangents[at + 1] as number) * third;
    d += `C${px(here.x + third)} ${px(enter)},${px(next.x - third)} ${px(leave)},${px(next.x)} ${px(next.y)}`;
  }
  return d;
}

function stepOf(points: readonly Point[]): string {
  let d = '';
  for (let at = 1; at < points.length; at += 1) {
    const here = points[at] as Point;
    const before = points[at - 1] as Point;
    d += `L${px(here.x)} ${px(before.y)}L${px(here.x)} ${px(here.y)}`;
  }
  return d;
}

function linearOf(points: readonly Point[]): string {
  let d = '';
  for (let at = 1; at < points.length; at += 1) {
    const here = points[at] as Point;
    d += `L${px(here.x)} ${px(here.y)}`;
  }
  return d;
}

const DRAW: Record<ChartCurve, (points: readonly Point[]) => string> = {
  linear: linearOf,
  monotone: monotoneOf,
  step: stepOf,
};

/** One unbroken run as a path. A run of one closes onto itself, which a round
 *  linecap draws as the dot the sample is. */
export function curveOf(points: readonly Point[], curve: ChartCurve): string {
  const first = points[0];
  if (!first) return '';
  const head = `M${px(first.x)} ${px(first.y)}`;
  if (points.length === 1) return `${head}L${px(first.x)} ${px(first.y)}`;
  return head + DRAW[curve](points);
}

/** `d` for the open trace of one series. Empty where nothing is finite; a run
 *  broken by a gap continues as a new subpath rather than jumping the hole. */
export function linePath(
  column: readonly (number | null)[],
  domain: ChartDomain,
  box: ChartBox,
  curve: ChartCurve = 'linear',
): string {
  return segmentsOf(column)
    .map((segment) => curveOf(pointsOf(column, segment, domain, box), curve))
    .join('');
}

/** `d` for the same trace closed down to the baseline, one filled shape per
 *  unbroken run. */
export function areaPath(
  column: readonly (number | null)[],
  domain: ChartDomain,
  box: ChartBox,
  curve: ChartCurve = 'linear',
): string {
  const floor = px(yAt(baselineOf(domain), domain, box));
  return segmentsOf(column)
    .map((segment) => {
      // A segment always spans at least one index and `pointsOf` drops nothing,
      // so the trace is never empty here and the points are never missing.
      const points = pointsOf(column, segment, domain, box);
      const trace = curveOf(points, curve);
      const start = px((points[0] as Point).x);
      const end = px((points.at(-1) as Point).x);
      return `${trace}L${end} ${floor}L${start} ${floor}Z`;
    })
    .join('');
}
