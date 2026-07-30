// One live chart of the stats panel, with every series sharing its axis. Stays
// SVG rather than canvas/Skia: a native canvas module would cost Tizen and
// webOS their renderer to reclaim microseconds (see the render call below for
// the actual measurement).
//
// Every series in one chart shares one y-axis, so grouping is a caller decision
// and only legal for series that share a unit (see PlayerMeter.chart). Identity
// is never colour alone — each series is direct-labelled with its own value
// beside a colour key, so the chart still reads in greyscale.

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

// Tall enough for a trend to have shape, short enough that two charts and
// twenty text rows still clear a 1080p frame.
const PLOT_H = 44;
const PAD_Y = 6;
// So the end dot and its ring are never half-drawn at the edge.
const DOT_ROOM = 7;

const DOT_R = 4;
const DOT_RING = 2;

// The card colour the ring paints, so a dot stays legible over a trace it
// crosses. Matches StatsPanel's own background.
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

// What one series contributes, resolved before any geometry so the drawn
// colour and the legend key can never drift apart.
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

  // Deliberately unmemoised: three series' worth of path-building measures at
  // ~44us, which at the panel's 2Hz poll is 0.09ms/s of wall clock — not worth a
  // memo, which would add code and a staleness bug risk for no measurable gain.
  const drawn = draw(series, box, reference?.value);

  return (
    <Box gap={6}>
      {/* This IS the legend: the value carries identity in text, the dot carries
          it in colour, and neither is load-bearing on its own. */}
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

// Palette slot, by position and never cycled past the set. A fourth series
// should have its own chart, so if one arrives it repeats the last slot rather
// than inventing a hue that fails the colourblind checks.
function slotColor(at: number): string {
  return SERIES_COLORS[Math.min(at, SERIES_COLORS.length - 1)] as string;
}

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
      // The area wash goes under a LONE trace only: a pair already has the band
      // between them carrying the fill, and a second wash there turns the plot
      // to mud.
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

// Closes an open trace down to the baseline so one path can be filled as an
// area — cheaper, and exactly aligned with the line it sits under.
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
