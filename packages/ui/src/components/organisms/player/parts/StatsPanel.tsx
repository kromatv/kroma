import { memo, useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Txt } from '#ui/components/atoms/text';
import { fonts } from '#ui/lib/tokens';
import { useT } from '#ui/services/i18n';
import { CHART_WINDOW } from '../lib/chart-geometry';
import type { PlayerController, PlayerMeter, PlayerStats } from '../types';
import { StatsChart } from './StatsChart';

/**
 * Discreet top-left "stats for nerds" overlay (§9): what the stream actually is,
 * versus what was asked for.
 *
 * ONE layout, whatever the platform reports. It used to have two - a stacked list
 * under a dozen rows and a wrapped multi-column grid over it - which meant the
 * lean native-TV snapshot and the rich web one were separate designs that drifted
 * independently and had to be reviewed twice. The single shape here is: a SUMMARY
 * that answers the first question (is this direct-playing?) as a headline plus a
 * wrapping run of label-value pairs, the live CHARTS, then the grouped
 * diagnostics as equal columns. A surface that reports less simply fills fewer of
 * those - the type, rhythm and width never change, so there is one design to
 * keep right.
 *
 * The card is near-opaque rather than the frosted 0.74 it was. This panel exists
 * to be READ over moving video, and its chart colours are validated against a
 * known surface - both of which a translucent card that samples an arbitrary
 * frame quietly breaks.
 *
 * Read-only: it never drives the engine, so it carries no D-pad focus beyond the
 * close X.
 */
export function StatsPanel({
  controller,
  onClose,
  top = 100,
  left = 34,
  width = PANEL_W,
  maxHeight,
}: Readonly<{
  /** Any read-only stats source; the full PlayerController satisfies this, and a
   *  surface with its own chrome (the phone) can hand just `getStats`. */
  controller: Pick<PlayerController, 'getStats'>;
  onClose: () => void;
  /** Position + width overrides for pocket-sized hosts; the defaults are the
   *  10-foot layout every TV/web surface uses. */
  top?: number;
  left?: number;
  width?: number;
  /** Cap the panel's height; the body scrolls past it (the header and its close
   *  X stay pinned). A screen shorter than the read-out must never CROP it. */
  maxHeight?: number;
}>) {
  const t = useT();
  const [s, setS] = useState<PlayerStats>(() => controller.getStats());
  // Rolling numeric history per meter key, kept across polls in a ref (drawing is
  // driven by the setS re-render, not by mutating this).
  const historyRef = useRef<Map<string, number[]>>(new Map());
  // The controller is rebuilt on every parent render (which happens ~4x/s while
  // playing, via timeupdate). Keep the latest `getStats` in a ref so the poll
  // interval below can be set up ONCE - depending on `controller` identity would
  // tear down and recreate the 500ms timer faster than it ever fires, freezing
  // the panel. `getStats` itself always reads the newest values.
  const getStatsRef = useRef(controller.getStats);
  getStatsRef.current = controller.getStats;

  // Refresh the live counters 2x/s: buffer, dropped frames and bitrate drift
  // slowly enough that a faster tick would only add repaint cost. Each snapshot's
  // numeric `meters` are appended to the per-key rolling history the charts draw
  // from (kept in the ref so recording never re-creates the effect).
  useEffect(() => {
    const record = (snap: PlayerStats) => {
      const hist = historyRef.current;
      const live = new Set<string>();
      for (const m of snap.meters ?? []) {
        live.add(m.key);
        const series = hist.get(m.key) ?? [];
        series.push(Number.isFinite(m.value) ? m.value : 0);
        if (series.length > CHART_WINDOW) series.shift();
        hist.set(m.key, series);
      }
      // Drop history for series no longer reported (e.g. engine changed).
      // Deleting the current key while iterating a Map is well-defined (the
      // iterator simply skips removed entries), so no snapshot copy is needed.
      for (const key of hist.keys()) if (!live.has(key)) hist.delete(key);
    };
    const tick = () => {
      const snap = getStatsRef.current();
      record(snap);
      setS(snap);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  const charts = chartGroups(s.meters ?? []);
  const stackCharts = width < 560;
  // A charted value must not ALSO be a text row. The web builder reports buffer,
  // bandwidth and stream bitrate as both, because the text rows predate the
  // charts - and a panel that prints "Bandwidth 91.32 Mb/s" twice, once as a row
  // and once beside its own trace, reads as a bug. The chart wins: it carries the
  // same number plus where it has been. Matched on the localized LABEL, so a
  // surface that reports no meters at all (a native TV plane) keeps every row it
  // always had and needs no say in this.
  const charted = new Set((s.meters ?? []).map((m) => m.label));
  const summary = summaryPairs(s, t, charted);
  const groups = groupBlocks(s, charted);

  return (
    <Box
      absolute
      top={top}
      left={left}
      z={20}
      w={width}
      maxH={maxHeight}
      radius={14}
      borderWidth={1}
      border="rgba(255, 255, 255, 0.1)"
      bg={CARD}
      px={PANEL_PAD}
      py={18}
      gap={16}
    >
      <Box row align="center" between gap={24}>
        <Txt style={PANEL_TITLE} color="rgba(244, 243, 240, 0.5)">
          {t('stats.title')}
        </Txt>
        {/* Pointer-only close, controlled at `false`: never a platform /
            navigator focus target (see ../lib/virtual-focus.ts). */}
        <IconButton
          variant="ghost"
          size={24}
          icon="x"
          glyph={15}
          focused={false}
          hitSlop={6}
          onPress={onClose}
          label={t('common.close')}
        />
      </Box>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={BODY}>
        <SummaryBlock headline={summary.headline} pairs={summary.pairs} />

        {charts.length > 0 ? (
          // A pocket-width panel stacks its charts: two traces sharing 400pt
          // truncate their own read-outs, and a chart that cannot show its
          // number is decoration.
          <Box row={!stackCharts} gap={stackCharts ? 12 : COL_GAP} align="stretch">
            {charts.map((group) => (
              <Box key={group.id} grow={1} shrink={1} style={stackCharts ? null : CHART_CELL}>
                <StatsChart
                  meters={group.meters}
                  history={historyRef.current}
                  width={chartWidth(stackCharts ? 1 : charts.length, width)}
                  slot={group.slot}
                />
              </Box>
            ))}
          </Box>
        ) : null}

        <GroupGrid groups={groups} />
      </ScrollView>
    </Box>
  );
}

/**
 * Why the text regions below are memoised
 * ---------------------------------------
 * The text is the bulk of this panel and almost none of it moves: a codec, a
 * resolution and a container are fixed for the whole session, and even the
 * counters only change a digit. Reconciling all of it twice a second is the
 * panel's real cost - not the chart geometry, which was measured at 0.09 ms per
 * second and left uncached on purpose (see StatsChart).
 *
 * The comparison is by CONTENT, not by identity, because every array and tuple
 * these take is freshly allocated on each poll: a default memo would compare
 * new arrays and never hit. React.memo with an explicit comparator says that
 * out loud, where a useMemo keyed on a hand-built signature string only implied
 * it - and could go stale the first time the signature missed a field.
 */
function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, at) => value === b[at]);
}

/**
 * The summary: the one line that answers a support question, then the fixed facts
 * as a wrapping run of pairs.
 *
 * `mode` is the headline because "direct play or transcode" explains most
 * complaints and nothing else on screen says it. The rest are the stream's
 * identity - they do not belong in a scrolling list of twenty diagnostics, and as
 * a wrapping run they cost two lines instead of seven rows.
 */
function SummaryBlockView({ headline, pairs }: Readonly<{ headline?: string; pairs: string[] }>) {
  if (!headline && pairs.length === 0) return null;
  return (
    <Box gap={8}>
      {headline ? <Txt style={HEADLINE}>{headline}</Txt> : null}
      {pairs.length > 0 ? (
        <Box row wrap gap={PAIR_GAP} align="center">
          {pairs.map((pair) => (
            <Txt key={pair} style={SUMMARY_PAIR} color="rgba(244, 243, 240, 0.62)">
              {pair}
            </Txt>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

const SummaryBlock = memo(
  SummaryBlockView,
  (a, b) => a.headline === b.headline && sameStrings(a.pairs, b.pairs),
);

/** The grouped diagnostics as equal columns. Three fill the row; one sits on the
 * left at the same column width. Nothing here branches on how many there are. */
function GroupGridView({ groups }: Readonly<{ groups: [string, [string, string][]][] }>) {
  if (groups.length === 0) return null;
  return (
    <Box row wrap gap={COL_GAP} align="flex-start" style={TOP_RULE}>
      {groups.map(([title, rows]) => (
        <StatBlock key={title} title={title} rows={rows} />
      ))}
    </Box>
  );
}

const GroupGrid = memo(GroupGridView, (a, b) => sameGroups(a.groups, b.groups));

function sameGroups(
  a: readonly [string, [string, string][]][],
  b: readonly [string, [string, string][]][],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(([title, rows], at) => {
    const other = b[at];
    if (other?.[0] !== title || other[1].length !== rows.length) return false;
    return rows.every(
      ([label, value], row) => other[1][row]?.[0] === label && other[1][row]?.[1] === value,
    );
  });
}

/** One block of grouped rows. Every block is the same column, so three of them
 * make three columns and one of them makes one - no branch. */
function StatBlock({ title, rows }: Readonly<{ title: string; rows: [string, string][] }>) {
  if (rows.length === 0) return null;
  return (
    <Box gap={8} style={COLUMN}>
      <Txt style={BLOCK_TITLE} color="rgba(244, 243, 240, 0.38)">
        {title}
      </Txt>
      {rows.map(([label, value]) => (
        <StatRow key={label} label={label} value={value} />
      ))}
    </Box>
  );
}

/** One label / value line. The value is tabular so the numbers stop jittering
 * as they tick, and because a column of them has to align. */
function StatRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Box row between gap={16}>
      <Txt style={STAT_LABEL} color="rgba(244, 243, 240, 0.5)">
        {label}
      </Txt>
      <Txt style={STAT_VALUE} color="rgba(244, 243, 240, 0.82)">
        {value}
      </Txt>
    </Box>
  );
}

/** The headline plus the identity pairs, in the order they read. */
function summaryPairs(
  s: PlayerStats,
  t: ReturnType<typeof useT>,
  charted: ReadonlySet<string>,
): { headline?: string; pairs: string[] } {
  const pairs: string[] = [];
  const push = (label: string, value?: string) => {
    if (value == null || value === '' || charted.has(label)) return;
    pairs.push(`${label} ${value}`);
  };
  push(t('stats.resolution'), s.resolution);
  // fps has no catalog key of its own and is a property of the video, so fold it
  // onto the video-codec pair rather than invent a label.
  push(t('stats.video'), [s.videoCodec, s.fps].filter(Boolean).join(' · '));
  push(t('stats.audio'), s.audioFormat);
  push(t('stats.avgBitrate'), s.bitrate);
  push(t('stats.buffer'), s.buffer);
  push(t('stats.droppedFrames'), s.dropped);
  // Extra rows that named no group were always shown with the headline fields;
  // they keep that place so a builder that groups nothing renders unchanged.
  for (const row of s.extra ?? []) {
    if (!row.group) push(row.label, row.value);
  }
  return { headline: s.mode, pairs };
}

/** The grouped diagnostics, in first-appearance order, minus anything a chart is
 * already drawing. A group whose every row was charted disappears with them. */
function groupBlocks(s: PlayerStats, charted: ReadonlySet<string>): [string, [string, string][]][] {
  const groups = new Map<string, [string, string][]>();
  for (const row of s.extra ?? []) {
    if (!row.group || row.value == null || row.value === '' || charted.has(row.label)) continue;
    const block = groups.get(row.group);
    if (block) block.push([row.label, row.value]);
    else groups.set(row.group, [[row.label, row.value]]);
  }
  return [...groups];
}

interface ChartGroup {
  id: string;
  meters: PlayerMeter[];
  /** How many series precede this chart, so palette slots stay distinct across
   *  the whole panel rather than restarting per chart. */
  slot: number;
}

/**
 * Meters, gathered into charts. Meters sharing a `chart` id land on one axis in
 * the order given; a meter that names none gets a chart to itself, which is what
 * every meter used to get.
 */
function chartGroups(meters: readonly PlayerMeter[]): ChartGroup[] {
  const out: ChartGroup[] = [];
  const byId = new Map<string, ChartGroup>();
  let slot = 0;
  for (const meter of meters) {
    const id = meter.chart ?? `@${meter.key}`;
    const existing = meter.chart ? byId.get(id) : undefined;
    if (existing) {
      existing.meters.push(meter);
    } else {
      const group: ChartGroup = { id, meters: [meter], slot };
      byId.set(id, group);
      out.push(group);
    }
    slot += 1;
  }
  return out;
}

/** Charts split the panel's inner width evenly, so one chart fills it and two
 * share it. Computed rather than measured: the panel's width is fixed, which is
 * what lets the SVG be sized without an extra layout pass on open. */
function chartWidth(count: number, panelWidth: number): number {
  const inner = panelWidth - PANEL_PAD * 2;
  return Math.floor((inner - COL_GAP * (count - 1)) / count);
}

/** Three diagnostic columns wide. Fixed, because it is what makes the chart width
 * knowable without measuring, and because a panel that resizes as counters
 * appear is a panel that twitches. */
const PANEL_W = 768;
const PANEL_PAD = 22;
const COL_GAP = 26;
const PAIR_GAP = 14;

/** Near-opaque: the numbers have to be readable over a bright frame, and the
 * chart palette is validated against this exact surface. */
const CARD = 'rgba(10, 10, 12, 0.94)';

/**
 * Every block is this column. Three fill the row; one sits at its natural width
 * on the left, which is the same design with less in it.
 *
 * The basis is deliberately well UNDER a third of the inner width (which is 724,
 * so a third is 224 once the gaps are taken out). At exactly a third, three
 * columns and two gaps sum to the full width and sub-pixel rounding tipped the
 * third block onto its own line - a 2+1 grid where the design says 3. Growing
 * from a smaller basis lands on the same final width without depending on the
 * arithmetic coming out even.
 */
const COLUMN = { flexBasis: 200, flexGrow: 1, flexShrink: 1, minWidth: 180 } as const;
const CHART_CELL = { flexBasis: 0, minWidth: 0 } as const;
/** The scrolling body keeps the panel's own rhythm between its blocks. */
const BODY = { gap: 16 } as const;
const TOP_RULE = {
  borderTopWidth: 1,
  borderTopColor: 'rgba(255, 255, 255, 0.08)',
  paddingTop: 16,
};

const HEADLINE = {
  fontFamily: fonts.ui,
  fontSize: 17,
  fontWeight: '700' as const,
  color: '#F4F3F0',
};

const SUMMARY_PAIR = { fontFamily: fonts.ui, fontSize: 12, fontWeight: '500' as const };

const BLOCK_TITLE = {
  fontFamily: fonts.ui,
  fontSize: 10,
  fontWeight: '700' as const,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
};

const PANEL_TITLE = {
  fontFamily: fonts.ui,
  fontSize: 11,
  fontWeight: '700' as const,
  letterSpacing: 1.76,
  textTransform: 'uppercase' as const,
};

const STAT_LABEL = { fontFamily: fonts.ui, fontSize: 13, fontWeight: '500' as const };

const STAT_VALUE = {
  fontFamily: fonts.ui,
  fontSize: 13,
  fontWeight: '500' as const,
  textAlign: 'right' as const,
  fontVariant: ['tabular-nums' as const],
};
