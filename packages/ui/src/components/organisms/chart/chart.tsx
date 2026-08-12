// <Chart>: a plot of one or more series over one shared scale.
//
// The Root owns the box, the scale and the paint, and it learns what to draw
// from its own direct children: a mark goes into the SVG, a scale reserves room
// beside the plot, the key sits under it. Only the SAMPLES are a `data` prop -
// they come off the wire, and a caller cannot be asked to write sixty of them
// in order.

import {
  Children,
  type Dispatch,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
  useMemo,
  useState,
} from 'react';
import type { LayoutChangeEvent, PointerEvent } from 'react-native';
import { Box, Row } from '#ui/components/atoms/box';
import type { ColorValue } from '#ui/core';
import { SERIES_COLORS } from '#ui/core/tokens';
import { Svg } from '#ui/lib/svg';
import { useControllable } from '#ui/lib/use-controllable';
import { ChartContext, type ChartMark, type ChartSeries, type ChartState } from './chart-context';
import { Area, Bar, type ChartBarProps, type ChartTraceProps, Line } from './chart-marks';
import {
  AXIS_ROOM,
  ChartAxis,
  type ChartAxisProps,
  ChartFooter,
  ChartGrid,
  ChartLegend,
  ChartTooltip,
} from './chart-parts';
import { type ChartPoint, columnOf, domainOf, indexAtX, stackBase } from './chart-scale';

const HEIGHT = 180;
const LEGEND_GAP = 14;

const round = (value: number) => String(Math.round(value * 100) / 100);

type MarkElement = ReactElement<ChartTraceProps & ChartBarProps>;

const MARKS: ReadonlySet<unknown> = new Set([Line, Area, Bar]);

function isMark(node: ReactNode): node is MarkElement {
  return isValidElement(node) && MARKS.has(node.type);
}

function isAxis(node: ReactNode): node is ReactElement<ChartAxisProps> {
  return isValidElement(node) && node.type === ChartAxis;
}

function isPart(node: ReactNode, part: unknown): boolean {
  return isValidElement(node) && node.type === part;
}

function markOf(type: unknown): ChartMark {
  if (type === Bar) return 'bar';
  if (type === Area) return 'area';
  return 'line';
}

// By POSITION and never cycled, so a reader who learned that blue is the remote
// traffic does not find it repainted when a series drops out. Past the palette
// the last slot repeats rather than inventing a hue that fails the CVD checks.
function slotColor(at: number): ColorValue {
  return SERIES_COLORS[Math.min(at, SERIES_COLORS.length - 1)] as ColorValue;
}

function seriesOf(marks: readonly MarkElement[], data: readonly ChartPoint[]): ChartSeries[] {
  const series: ChartSeries[] = [];
  const seen = new Set<string>();
  const stack: (readonly (number | null)[])[] = [];
  let group = -1;
  for (const mark of marks) {
    const key = mark.props.series;
    if (seen.has(key)) continue;
    seen.add(key);
    const column = columnOf(data, key);
    const entry: ChartSeries = {
      series: key,
      label: mark.props.label,
      color: mark.props.color ?? slotColor(series.length),
      mark: markOf(mark.type),
      column,
    };
    if (entry.mark === 'bar') {
      if (mark.props.stack && group >= 0) entry.base = stackBase(stack, data.length);
      else {
        stack.length = 0;
        group += 1;
      }
      entry.stackAt = group;
      stack.push(column);
    }
    series.push(entry);
  }
  return series;
}

// A stacked bar is read at the top of its stack, so that is what the scale has
// to reach.
function topsOf(series: readonly ChartSeries[]): (number | null)[][] {
  return series.map((entry) =>
    entry.column.map((value, at) => (value === null ? null : value + (entry.base?.[at] ?? 0))),
  );
}

interface ChartRootProps {
  /** The samples, oldest first. */
  data: readonly ChartPoint[];
  /** The field naming each sample along the bottom edge. Omit it and the
   *  samples go unnamed, which is what a sparkline wants. */
  x?: string;
  /** The whole chart's width. Omit it and the Root measures its own box, which
   *  costs one frame before the first paint. */
  width?: number;
  /** The plot's height, plus whatever a bottom scale reserves. Defaults to 180. */
  height?: number;
  /** Pins the low end of the scale, which is otherwise read off the data. */
  min?: number;
  /** Pins the high end. A `max` at or below `min` is widened rather than
   *  refused. */
  max?: number;
  /** How a value is written on a scale and in the readout. */
  format?: (value: number) => string;
  /** Names the PLOT to assistive tech, which cannot read a drawing: say what it
   *  shows and how it is going. A plot with no name is decoration, and is
   *  hidden from the accessibility tree rather than announced as an image. */
  label?: string;
  /** The sample the readout is on, as an index into `data`. */
  active?: number | null;
  defaultActive?: number | null;
  onActiveChange?: (index: number | null) => void;
  /** The grid, the marks, the scales, the key and the readout. Only a DIRECT
   *  child takes part: the Root sorts them to know what belongs where. */
  children?: ReactNode;
}

function Root({
  data,
  x,
  width,
  height = HEIGHT,
  min,
  max,
  format = round,
  label,
  active: activeProp,
  defaultActive,
  onActiveChange,
  children,
}: Readonly<ChartRootProps>) {
  const [measured, setMeasured] = useState(0);
  const [active, setActive] = useControllable<number | null>(
    activeProp,
    defaultActive ?? null,
    onActiveChange,
  );

  const kids = Children.toArray(children);
  const marks = kids.filter(isMark);
  const axes = kids.filter(isAxis);
  const left = axes.find((axis) => axis.props.edge === 'left');
  const bottom = axes.find((axis) => axis.props.edge === 'bottom');

  const room = width ?? measured;
  // Held apart as numbers so the box below is a new object only when the box
  // actually changed, which is what lets the state around it hold still.
  const plotWidth = Math.max(0, room - (left ? (left.props.room ?? AXIS_ROOM.left) : 0));
  const plotHeight = Math.max(0, height - (bottom ? (bottom.props.room ?? AXIS_ROOM.bottom) : 0));
  const plot = useMemo(() => ({ width: plotWidth, height: plotHeight }), [plotWidth, plotHeight]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `marks` is rebuilt from `children` on every render, and its content is what matters
  const series = useMemo(() => seriesOf(marks, data), [children, data]);
  const band = series.some((entry) => entry.mark === 'bar');
  const cursor = kids.some((kid) => isPart(kid, ChartTooltip));
  // The key and the caption share one row, at either end of it.
  const caption = kids.filter((kid) => isPart(kid, ChartLegend) || isPart(kid, ChartFooter));

  // Memoised: every part below reads this, so a fresh object per render would
  // redraw every mark, axis and readout whenever anything above the chart did.
  const state = useMemo<ChartState>(
    () => ({
      data,
      count: data.length,
      plot,
      domain: domainOf(topsOf(series), {
        min,
        max,
        baseline: series.some((entry) => entry.mark !== 'line'),
      }),
      series,
      band,
      labels: data.map((point) => (x ? String(point[x] ?? '') : '')),
      format,
      label,
      active,
      setActive,
    }),
    [data, plot, series, band, x, format, label, active, setActive, min, max],
  );

  const track = (event: PointerEvent) => {
    const next = indexAtX(event.nativeEvent.offsetX, state.count, plot.width, band);
    if (next !== active) setActive(next);
  };

  return (
    <ChartContext.Provider value={state}>
      <Box onLayout={width === undefined ? measure(setMeasured) : undefined}>
        <Row align="flex-start">
          {left}
          <Box>
            <Box
              w={plot.width}
              h={plot.height}
              {...(label
                ? { accessibilityRole: 'image' as const, accessibilityLabel: label }
                : { accessible: false, 'aria-hidden': true })}
              {...(cursor ? { onPointerMove: track, onPointerLeave: () => setActive(null) } : null)}
            >
              {kids.filter((kid) => isPart(kid, ChartGrid))}
              {plot.width > 0 && plot.height > 0 ? (
                <Svg width={plot.width} height={plot.height}>
                  {marks}
                </Svg>
              ) : null}
              {kids.filter((kid) => isPart(kid, ChartTooltip))}
            </Box>
            {bottom}
          </Box>
        </Row>
        {caption.length > 0 ? (
          <Row wrap between gap={16} mt={LEGEND_GAP}>
            {caption}
          </Row>
        ) : null}
      </Box>
    </ChartContext.Provider>
  );
}

function measure(set: Dispatch<SetStateAction<number>>) {
  return (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    set((current) => (current === next ? current : next));
  };
}

/**
 * A plot of one or more series over one shared scale.
 *
 * ```tsx
 * <Chart.Root data={samples} x="at" height={208} format={mbps} label="Debit">
 *   <Chart.Grid />
 *   <Chart.Area series="local" label="Local" />
 *   <Chart.Line series="remote" label="Distant" />
 *   <Chart.Axis edge="left" />
 *   <Chart.Axis edge="bottom" />
 *   <Chart.Tooltip />
 *   <Chart.Legend />
 * </Chart.Root>
 * ```
 */
const Chart = {
  Root,
  Grid: ChartGrid,
  Line,
  Area,
  Bar,
  Axis: ChartAxis,
  Tooltip: ChartTooltip,
  Legend: ChartLegend,
  Footer: ChartFooter,
};

export type { ChartRootProps };
export { Chart };
