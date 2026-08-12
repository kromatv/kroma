// The marks: one series each, drawn inside the Root's plot. Everything they
// need beyond their own paint comes off the context, because the scale belongs
// to the chart and not to any one series on it.

import { type ColorValue, color } from '#ui/core';
import { Path } from '#ui/lib/svg';
import { type ChartSeries, type ChartState, useChart } from './chart-context';
import { areaPath, type ChartCurve, linePath } from './chart-path';
import { bandAt, barPath, px, yAt } from './chart-scale';

const TRACE = 2.4;
const WASH = 0.16;
const BAR_CORNER = 4;

interface ChartMarkProps {
  /** The field on a point this series draws. */
  series: string;
  /** What the legend and the tooltip call it. Nothing draws it on the plot. */
  label?: string;
  /** Opaque paint, defaulting to the data palette slot this mark's position
   *  earns. A wash is drawn with an opacity, never with an alpha on the paint. */
  color?: ColorValue;
}

interface ChartTraceProps extends ChartMarkProps {
  /** How the trace gets from one sample to the next. `monotone` is a smooth
   *  cubic that cannot leave the range of the two samples it joins; `step` holds
   *  a value until the next sample replaces it; `linear` joins them straight.
   *  Defaults to `monotone`. */
  curve?: ChartCurve;
  /** The trace's width in px. */
  thickness?: number;
}

interface ChartBarProps extends ChartMarkProps {
  /** Stand on the bars declared before this one rather than beside them. */
  stack?: boolean;
}

function seriesOf(state: ChartState, key: string): ChartSeries | undefined {
  return state.series.find((entry) => entry.series === key);
}

function Trace({ paint, d, thickness }: Readonly<{ paint: string; d: string; thickness: number }>) {
  return (
    <Path
      d={d}
      fill="none"
      stroke={paint}
      strokeWidth={thickness}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

/** One series as an open trace. */
function Line({ series, curve = 'monotone', thickness = TRACE }: Readonly<ChartTraceProps>) {
  const state = useChart('Line');
  const found = seriesOf(state, series);
  if (!found) return null;
  const d = linePath(found.column, state.domain, state.plot, curve);
  return d ? <Trace paint={color(found.color)} d={d} thickness={thickness} /> : null;
}

/** One series as a trace over a wash down to the baseline. */
function Area({ series, curve = 'monotone', thickness = TRACE }: Readonly<ChartTraceProps>) {
  const state = useChart('Area');
  const found = seriesOf(state, series);
  if (!found) return null;
  const d = linePath(found.column, state.domain, state.plot, curve);
  if (!d) return null;
  const paint = color(found.color);
  return (
    <>
      <Path
        d={areaPath(found.column, state.domain, state.plot, curve)}
        fill={paint}
        fillOpacity={WASH}
        stroke="none"
      />
      <Trace paint={paint} d={d} thickness={thickness} />
    </>
  );
}

const filled = (value: number | null | undefined) =>
  value !== null && value !== undefined && value !== 0;

// Which ends of a column this segment owns at one sample: the outermost drawn
// segments carry the whole stack's radius, and every join between two is
// square. Read per sample, because the topmost segment changes as a series
// drops to zero.
function cornersOf(
  stack: readonly ChartSeries[],
  found: ChartSeries,
  at: number,
): { top: number; bottom: number } {
  const drawn = stack.filter((entry) => filled(entry.column[at]));
  return {
    top: drawn.at(-1) === found ? BAR_CORNER : 0,
    bottom: drawn[0] === found ? BAR_CORNER : 0,
  };
}

/** One series as a bar per sample. */
function Bar({ series }: Readonly<ChartBarProps>) {
  const state = useChart('Bar');
  const found = seriesOf(state, series);
  if (!found) return null;
  const stack = state.series.filter(
    (entry) => entry.mark === 'bar' && entry.stackAt === found.stackAt,
  );
  const paint = color(found.color);
  return (
    <>
      {found.column.map((value, at) => {
        if (!filled(value)) return null;
        const foot = found.base?.[at] ?? 0;
        const band = bandAt(at, state.count, state.plot.width);
        const y = px(yAt(foot + (value as number), state.domain, state.plot));
        const height = px(yAt(foot, state.domain, state.plot)) - y;
        if (height <= 0) return null;
        return (
          <Path
            // The slot IS the identity: bar 3 is always bar 3, holding whatever
            // sample is current.
            // biome-ignore lint/suspicious/noArrayIndexKey: the position is the identity here
            key={at}
            d={barPath({ x: band.x, width: band.width, y, height }, cornersOf(stack, found, at))}
            fill={paint}
          />
        );
      })}
    </>
  );
}

export type { ChartBarProps, ChartMarkProps, ChartTraceProps };
export { Area, Bar, Line };
