// The chrome around a plot: the ruled ground, the two scales, the key and the
// readout. None of it is drawn into the SVG - it is laid out and painted with
// the theme, so the grid and the labels follow the ground the way every other
// surface in the kit does.

import type { ReactNode } from 'react';
import { Box, Row } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Legend } from '#ui/components/molecules/legend';
import { styles } from '#ui/core';
import { type ChartState, useChart } from './chart-context';
import { bandAt, px, ticksOf, xAt, yAt } from './chart-scale';

/** Which edge a scale is drawn along. */
type ChartEdge = 'bottom' | 'left';

const TICKS = 5;

/** What each scale reserves for its labels when the caller says nothing. */
const AXIS_ROOM: Record<ChartEdge, number> = { left: 52, bottom: 20 };

const AXIS_GAP = 8;
const TICK_HALF = 8;
const LABEL_ROOM = 72;
const CURSOR_GAP = 12;
const READOUT_MAX = 200;
const DOT = 7;

// One label every so many samples, so a minute of polling does not print sixty
// names over each other.
function spacing(count: number, width: number): number {
  const slots = Math.max(1, Math.floor(width / LABEL_ROOM));
  return Math.max(1, Math.ceil(count / slots));
}

function sampleX(state: ChartState, index: number): number {
  if (!state.band) return xAt(index, state.count, state.plot.width);
  const band = bandAt(index, state.count, state.plot.width);
  return band.x + band.width / 2;
}

interface ChartGridProps {
  /** How many rules, both ends included. Defaults to 5. */
  ticks?: number;
}

/** The ruled ground a plot is read against: one horizontal rule per level. */
function ChartGrid({ ticks = TICKS }: Readonly<ChartGridProps>) {
  const state = useChart('Grid');
  return (
    <Box absolute left={0} top={0} w={state.plot.width} h={state.plot.height}>
      {ticksOf(state.domain, ticks).map((level) => (
        <Box
          key={level}
          absolute
          left={0}
          right={0}
          h={1}
          bg="tint/5"
          top={px(yAt(level, state.domain, state.plot))}
        />
      ))}
    </Box>
  );
}

interface ChartAxisProps {
  /** Which edge the scale runs along. */
  edge: ChartEdge;
  /** How many levels a left scale labels, both ends included. Defaults to 5.
   *  A bottom scale draws whatever the points are named, so it ignores this. */
  ticks?: number;
  /** How much room the labels are given, in px. Defaults to 52 on the left and
   *  20 along the bottom. */
  room?: number;
  /** A bottom scale labels one sample in every `every`, counting back from the
   *  newest so that one is always named. Defaults to as many as fit. */
  every?: number;
  /** Overrides the Root's `format` for this scale. */
  format?: (value: number) => string;
}

/** One edge's scale: its levels and their labels. */
function ChartAxis({ edge, ticks = TICKS, room, every, format }: Readonly<ChartAxisProps>) {
  const state = useChart('Axis');
  const band = room ?? AXIS_ROOM[edge];
  if (edge === 'left') {
    const write = format ?? state.format;
    return (
      <Box w={band} h={state.plot.height} shrink={0}>
        {ticksOf(state.domain, ticks).map((level) => (
          <Box
            key={level}
            absolute
            right={AXIS_GAP}
            top={px(yAt(level, state.domain, state.plot)) - TICK_HALF}
          >
            <Text variant="meta" color="textDim" style={s.tick} lines={1}>
              {write(level)}
            </Text>
          </Box>
        ))}
      </Box>
    );
  }
  const step = every ?? spacing(state.count, state.plot.width);
  return (
    <Box h={band} w={state.plot.width} shrink={0}>
      {state.labels.map((name, at) =>
        name && (state.count - 1 - at) % step === 0 ? (
          <Box
            // The sample's position IS its identity: nothing reorders a series,
            // and two samples an hour apart can carry the same name.
            // biome-ignore lint/suspicious/noArrayIndexKey: the position is the identity here
            key={at}
            absolute
            top={AXIS_GAP / 2}
            left={px(sampleX(state, at)) - LABEL_ROOM / 2}
            w={LABEL_ROOM}
            align="center"
          >
            <Text variant="meta" color="textDim" style={s.tick} lines={1}>
              {name}
            </Text>
          </Box>
        ) : null,
      )}
    </Box>
  );
}

/** The key to the plot's colours, one entry per named series. */
function ChartLegend() {
  const state = useChart('Legend');
  const named = state.series.filter((entry) => entry.label);
  if (named.length === 0) return null;
  return (
    <Legend.Root>
      {named.map((entry) => (
        <Legend.Item key={entry.series} color={entry.color}>
          {entry.label}
        </Legend.Item>
      ))}
    </Legend.Root>
  );
}

interface ChartFooterProps {
  /** The caption: an average, a total, the window the samples cover. */
  children?: ReactNode;
}

/** The caption under a plot, on the key's row and pushed to the far end. */
function ChartFooter({ children }: Readonly<ChartFooterProps>) {
  useChart('Footer');
  return (
    <Text variant="meta" color="textDim">
      {children}
    </Text>
  );
}

/** The readout for the sample under the pointer, and the rule marking it.
 *  Writing one is also what makes the plot track a pointer at all. */
function ChartTooltip() {
  const state = useChart('Tooltip');
  const at = state.active;
  if (at === null || at < 0 || at >= state.count) return null;
  const x = px(sampleX(state, at));
  const past = x > state.plot.width / 2;
  const name = state.labels[at];
  return (
    <>
      {/* The rule is drawn AT the pointer, so without this it becomes the event
          target and the plot reads `offsetX` from a box one pixel wide: the
          readout jumps to the first sample, the rule follows it away from the
          pointer, and the pair flickers. Every part of the plot is decoration
          and none of it takes the pointer. */}
      <Box
        absolute
        top={0}
        left={x}
        w={1}
        h={state.plot.height}
        bg="tint/14"
        pointerEvents="none"
      />
      <Box
        absolute
        top={0}
        maxW={READOUT_MAX}
        pointerEvents="none"
        {...(past ? { right: state.plot.width - x + CURSOR_GAP } : { left: x + CURSOR_GAP })}
      >
        <Box bg="surface2" borderWidth={1} border="border" radius="md" px={10} py={8} gap={4}>
          {name ? (
            <Text variant="meta" color="textMuted" lines={1}>
              {name}
            </Text>
          ) : null}
          {state.series.map((entry) => {
            const value = entry.column[at];
            if (value === null || value === undefined) return null;
            return (
              <Row key={entry.series} between gap={12}>
                <Row gap={7}>
                  <Box w={DOT} h={DOT} shrink={0} radius="circle" bg={entry.color} />
                  <Text variant="meta" color="textMuted" lines={1}>
                    {entry.label ?? entry.series}
                  </Text>
                </Row>
                <Text variant="meta" style={s.readout}>
                  {state.format(value)}
                </Text>
              </Row>
            );
          })}
        </Box>
      </Box>
    </>
  );
}

const s = styles({
  tick: { font: 'ui', fontSize: 11, fontWeight: '500' },
  readout: { font: 'ui', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export type { ChartAxisProps, ChartEdge, ChartFooterProps, ChartGridProps };
export { AXIS_ROOM, ChartAxis, ChartFooter, ChartGrid, ChartLegend, ChartTooltip };
