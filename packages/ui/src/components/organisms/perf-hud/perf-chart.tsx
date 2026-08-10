// The frame-time chart: one bar per recent frame, tallest is slowest.
//
// Drawn out of plain views rather than a canvas or an SVG, because it has to
// render on a television, a phone and a browser from the same source, and
// because a chart that needed a drawing dependency would be a dependency the
// kit takes on for a debug overlay.
//
// Reading it: the two rules are the 60Hz and 30Hz budgets. Bars under the low
// rule are frames nobody felt. A wall of amber is evenly slow - something costs
// too much every frame. A flat field with one red spike is a hitch, and the
// thing that caused it is whatever you just did.

import { Box } from '#ui/components/atoms/box';
import { colors, styles } from '#ui/core';
import { CHART_FRAMES } from '#ui/lib/perf';

/** Frames slower than this missed a 60Hz budget; slower than twice it, a 30Hz one. */
const BUDGET_MS = 1000 / 60;

// Taller than the 30Hz budget so a bad frame has somewhere to go, and clamped
// so one 900ms stall does not flatten every other bar to nothing.
const CEILING_MS = BUDGET_MS * 4;
const HEIGHT = 34;

function barColor(ms: number): string {
  if (ms > BUDGET_MS * 2) return colors.danger;
  if (ms > BUDGET_MS) return colors.accent;
  return colors.success;
}

/** The last frames as a bar chart, newest at the right. */
function PerfChart({ frames }: Readonly<{ frames: readonly number[] }>) {
  // A television draws this every refresh, so the bar count is what keeps it
  // cheap. The newest samples are the ones being asked about.
  const shown = frames.slice(-CHART_FRAMES);
  return (
    <Box style={s.chart}>
      {/* The budgets, drawn behind the bars: a chart of frame times without
          them is a shape with nothing to be good or bad against. */}
      <Box style={[s.rule, { bottom: (BUDGET_MS / CEILING_MS) * HEIGHT }]} />
      <Box style={[s.rule, { bottom: ((BUDGET_MS * 2) / CEILING_MS) * HEIGHT }]} />
      <Box row style={s.bars}>
        {shown.map((ms, i) => (
          <Box
            // Frame times repeat and carry no identity, so the slot IS the
            // identity: bar 3 is always bar 3, holding whatever is current.
            // biome-ignore lint/suspicious/noArrayIndexKey: the position is the identity here
            key={i}
            style={[
              s.bar,
              {
                height: Math.max(1, Math.min(ms / CEILING_MS, 1) * HEIGHT),
                backgroundColor: barColor(ms),
              },
            ]}
          />
        ))}
      </Box>
    </Box>
  );
}

const s = styles({
  chart: { h: HEIGHT, justify: 'flex-end', mt: 6 },
  bars: { h: HEIGHT, align: 'flex-end', gap: 1 },
  bar: { w: 3, radius: 1 },
  rule: { absolute: true, left: 0, right: 0, h: 1, bg: 'border' },
});

export { PerfChart };
