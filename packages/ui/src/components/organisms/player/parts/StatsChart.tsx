// <StatsChart>: one live chart of the stats panel, with every series that shares
// its axis.
//
// On the renderer, which is the question this component exists to answer
// ---------------------------------------------------------------------
// It draws SVG, and it stays SVG on purpose. The obvious suspicion is that the
// geometry is the cost, so it was measured: building the point geometry for three
// 80-sample series takes ~44 us, and at the panel's 2 Hz poll that is 0.09 ms per
// SECOND of wall clock. There is nothing there to win. A canvas backend would
// need a web/native pair of this file (React Native has no canvas), and Skia
// would need a native module, which would cost Tizen and webOS their renderer
// altogether - both to reclaim microseconds.
//
// What actually costs, in order: React reconciling the panel on every poll, and
// the number of SVG nodes the compositor re-rasterises. So the effort goes there
// instead - each trace is ONE <Path> rather than the polyline pair it used to be,
// and StatsPanel keeps its slow-moving text rows out of the poll's render path.
// The geometry itself is rebuilt every render, uncached, because the measurement
// above says caching it would buy nothing and cost a staleness bug.
//
// On the design
// -------------
// Every series in one chart shares one y-axis, which is why grouping is a caller
// decision and only legal for series that share a unit (see PlayerMeter.chart).
// The marks follow the house chart specs: 2px traces with round joins, a ~10%
// area wash, an 8px end dot ringed in the surface colour so "now" is findable
// where traces cross, and a recessive hairline for a reference level. Identity is
// never colour alone - each series is direct-labelled with its own value beside a
// colour key, so the chart still reads in greyscale.

import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { Circle, Line, Path, Svg } from '#ui/lib/svg';
import { fonts, SERIES_COLORS } from '#ui/lib/tokens';
import {
  bandPath,
  type ChartBox,
  endPoint,
  extentOf,
  px,
  seriesPath,
  yAt,
} from '../lib/chart-geometry';
import type { PlayerMeter } from '../types';

/** Plot height. Tall enough for a trend to have a shape, short enough that two
 * charts and twenty text rows still clear a 1080p frame. */
const PLOT_H = 44;
/** Vertical inset: half a stroke plus the end dot's ring. */
const PAD_Y = 6;
/** Right inset, so the end dot and its ring are never half-drawn at the edge. */
const DOT_ROOM = 7;

/** The end dot: r=4 (an 8px mark) plus a 2px ring in the surface colour. */
const DOT_R = 4;
const DOT_RING = 2;

/** The card colour the ring paints, so a dot stays legible over a trace it
 * crosses. Matches StatsPanel's own background. */
const SURFACE = '#0C0C0E';

const TRACE_W = 2;
const AREA_OPACITY = 0.1;
const BAND_OPACITY = 0.14;

const EMPTY: number[] = [];

export interface StatsChartProps {
  /** Meters sharing this chart's axis, in draw order. */
  meters: readonly PlayerMeter[];
  /** Rolling sample history per meter key, oldest first. */
  history: ReadonlyMap<string, number[]>;
  /** Plot width. The panel gives the chart band its full inner width. */
  width: number;
  /** Palette offset, so slot assignment is stable across charts: the second
   *  chart's first series is the palette's next colour, not its first. */
  slot: number;
}

/** What one series contributes, resolved before any geometry so the drawn colour
 * and the legend key can never drift apart. */
interface Resolved {
  key: string;
  display: string;
  color: string;
  data: readonly number[];
  band: boolean;
}

export function StatsChart({ meters, history, width, slot }: Readonly<StatsChartProps>) {
  const plotW = Math.max(1, width - DOT_ROOM);
  const box: ChartBox = { width: plotW, height: PLOT_H, padY: PAD_Y };

  const series: Resolved[] = meters.map((meter, i) => ({
    key: meter.key,
    display: meter.display,
    color: meter.color ?? slotColor(slot + i),
    data: history.get(meter.key) ?? EMPTY,
    band: Boolean(meter.band),
  }));

  const reference = meters.find((m) => m.reference)?.reference;

  // Built on every render, deliberately unmemoised. The instinct is to cache this
  // - it is a loop over 80 samples building path strings - so it was measured
  // first: three series' worth is ~44 us, which at the panel's 2 Hz poll is
  // 0.09 ms per second of wall clock. There is nothing to save, and a memo keyed
  // on a hand-rolled signature of the samples would be more code, more to get
  // wrong, and a stale chart the first time the signature missed something.
  const drawn = draw(series, box, reference?.value);

  return (
    <Box gap={6}>
      {/* Label left, then one direct-labelled value per series beside its colour
          key. This IS the legend: the value carries identity in text, the dot
          carries it in colour, and neither is load-bearing on its own. */}
      <Box row align="center" between gap={16}>
        <Txt style={CHART_LABEL} color="rgba(244, 243, 240, 0.5)" lines={1}>
          {meters.find((m) => m.chartLabel)?.chartLabel ?? meters.map((m) => m.label).join(' · ')}
        </Txt>
        <Box row align="center" gap={14} shrink={0}>
          {series.map((s) => (
            <Box key={s.key} row align="center" gap={6}>
              {series.length > 1 ? <Box w={7} h={7} radius="pill" bg={s.color} /> : null}
              <Txt style={CHART_VALUE} color="rgba(244, 243, 240, 0.82)">
                {s.display}
              </Txt>
            </Box>
          ))}
        </Box>
      </Box>

      <Svg width={plotW + DOT_ROOM} height={PLOT_H}>
        {/* The reference level draws first, so every trace passes over it. Solid
            hairline in a recessive grey: it is grid furniture, not data. */}
        {drawn.refY != null ? (
          <Line
            x1={0}
            y1={drawn.refY}
            x2={plotW + DOT_ROOM}
            y2={drawn.refY}
            stroke="rgba(244, 243, 240, 0.18)"
            strokeWidth={1}
          />
        ) : null}
        {drawn.band ? (
          <Path d={drawn.band} fill={series[0]?.color} fillOpacity={BAND_OPACITY} stroke="none" />
        ) : null}
        {drawn.traces.map((trace) =>
          trace.area ? (
            <Path
              key={`area-${trace.key}`}
              d={trace.area}
              fill={trace.color}
              fillOpacity={AREA_OPACITY}
              stroke="none"
            />
          ) : null,
        )}
        {drawn.traces.map((trace) => (
          <Path
            key={`line-${trace.key}`}
            d={trace.d}
            fill="none"
            stroke={trace.color}
            strokeWidth={TRACE_W}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {drawn.traces.map((trace) =>
          trace.dot ? (
            <Circle
              key={`dot-${trace.key}`}
              cx={trace.dot.x}
              cy={trace.dot.y}
              r={DOT_R}
              fill={trace.color}
              stroke={SURFACE}
              strokeWidth={DOT_RING}
            />
          ) : null,
        )}
      </Svg>

      {reference ? (
        <Txt style={CHART_FOOT} color="rgba(244, 243, 240, 0.38)">
          {reference.label}
        </Txt>
      ) : null}
    </Box>
  );
}

/** Palette slot, by position and never cycled past the set. A fourth series has
 * no fourth colour by design (see SERIES_COLORS) - it should have been given its
 * own chart, so if one arrives it repeats the last slot rather than inventing a
 * hue that fails the colourblind checks. */
function slotColor(at: number): string {
  return SERIES_COLORS[Math.min(at, SERIES_COLORS.length - 1)] as string;
}

/** Every path string this chart draws, built once per advanced window. */
function draw(series: readonly Resolved[], box: ChartBox, reference?: number) {
  const extent = extentOf(
    series.map((s) => s.data),
    reference,
  );
  const traces = series.map((s) => {
    const d = seriesPath(s.data, extent, box);
    return {
      key: s.key,
      color: s.color,
      d,
      // The area wash goes under a LONE trace only. A pair already has the band
      // between them carrying the fill, and a second overlapping wash there turns
      // the plot to mud.
      area: series.length === 1 ? closeToBaseline(d, box) : '',
      dot: endPoint(s.data, extent, box),
    };
  });
  return {
    traces,
    band: series[0]?.band && series[1] ? bandPath(series[0].data, series[1].data, extent, box) : '',
    refY: reference == null ? null : px(yAt(reference, extent, box)),
  };
}

/** Close an open trace down to the baseline so one path can be filled as an
 * area - cheaper, and exactly aligned with the line it sits under. */
function closeToBaseline(d: string, box: ChartBox): string {
  const first = /^M([\d.]+) /.exec(d);
  if (!first) return '';
  return `${d}L${box.width} ${box.height}L${first[1]} ${box.height}Z`;
}

/** Exported for the panel, which sizes its chart band to match. */
export const STATS_CHART_HEIGHT = PLOT_H;

export type { Extent } from '../lib/chart-geometry';

const CHART_LABEL = {
  fontFamily: fonts.ui,
  fontSize: 10,
  fontWeight: '700' as const,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
};

const CHART_VALUE = {
  fontFamily: fonts.ui,
  fontSize: 13,
  fontWeight: '600' as const,
  fontVariant: ['tabular-nums' as const],
};

const CHART_FOOT = {
  fontFamily: fonts.ui,
  fontSize: 10,
  fontWeight: '500' as const,
};
