import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Ground } from '#ui/components/atoms/ground';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useT } from '#ui/services/i18n';
import { CHART_WINDOW } from '../../lib/chart-geometry';
import type { PlayerController, PlayerMeter, PlayerStats } from '../../types';
import { StatsChart } from './stats-chart';

/**
 * Discreet top-left "stats for nerds" overlay: what the stream actually is,
 * versus what was asked for. Read-only, so it carries no D-pad focus beyond the
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
  controller: Pick<PlayerController, 'getStats'>;
  onClose: () => void;
  top?: number;
  left?: number;
  width?: number;
  maxHeight?: number;
}>) {
  const t = useT();
  const place = useMemo(
    () => ({ position: 'absolute' as const, top, left, zIndex: 20 }),
    [top, left],
  );
  const [s, setS] = useState<PlayerStats>(() => controller.getStats());
  const historyRef = useRef<Map<string, number[]>>(new Map());
  // The controller is rebuilt on every parent render (~4x/s while playing, via
  // timeupdate), so keep `getStats` in a ref: depending on `controller` identity
  // would recreate the 500ms timer faster than it ever fires.
  const getStatsRef = useRef(controller.getStats);
  getStatsRef.current = controller.getStats;

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
      // Deleting the current key while iterating a Map is well-defined, so no
      // snapshot copy is needed.
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
  // A charted value must not ALSO be a text row. Matched on the localized label,
  // so a surface reporting no meters keeps every row it always had.
  const charted = new Set((s.meters ?? []).map((m) => m.label));
  const summary = summaryPairs(s, t, charted);
  const groups = groupBlocks(s, charted);

  return (
    <Ground tone="dark" style={place}>
      <Box
        w={width}
        maxH={maxHeight}
        radius="lg"
        borderWidth={1}
        border="white/10"
        bg="bg/94"
        px={PANEL_PAD}
        py={18}
        gap={16}
      >
        <Box row align="center" between gap={24}>
          <Text style={sx.panelTitle} color="text/50">
            {t('stats.title')}
          </Text>
          {/* Pointer-only: `focused={false}` keeps this out of the focus
              navigator (see ../lib/virtual-focus.ts). */}
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

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={sx.body}>
          <SummaryBlock headline={summary.headline} pairs={summary.pairs} />

          {charts.length > 0 ? (
            <Box row={!stackCharts} gap={stackCharts ? 12 : COL_GAP} align="stretch">
              {charts.map((group) => (
                <Box key={group.id} grow={1} shrink={1} style={stackCharts ? null : sx.chartCell}>
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
    </Ground>
  );
}

// The memo comparators below compare by CONTENT: every array and tuple these
// take is freshly allocated on each poll, so a default memo would never hit.
function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, at) => value === b[at]);
}

function SummaryBlockView({ headline, pairs }: Readonly<{ headline?: string; pairs: string[] }>) {
  if (!headline && pairs.length === 0) return null;
  return (
    <Box gap={8}>
      {headline ? <Text style={sx.headline}>{headline}</Text> : null}
      {pairs.length > 0 ? (
        <Box row wrap gap={PAIR_GAP} align="center">
          {pairs.map((pair) => (
            <Text key={pair} style={sx.summaryPair} color="textMuted">
              {pair}
            </Text>
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

function GroupGridView({ groups }: Readonly<{ groups: [string, [string, string][]][] }>) {
  if (groups.length === 0) return null;
  return (
    <Box row wrap gap={COL_GAP} align="flex-start" style={sx.topRule}>
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

function StatBlock({ title, rows }: Readonly<{ title: string; rows: [string, string][] }>) {
  if (rows.length === 0) return null;
  return (
    <Box gap={8} style={sx.column}>
      <Text style={sx.blockTitle} color="text/38">
        {title}
      </Text>
      {rows.map(([label, value]) => (
        <StatRow key={label} label={label} value={value} />
      ))}
    </Box>
  );
}

function StatRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Box row between gap={16}>
      <Text style={sx.statLabel} color="text/50">
        {label}
      </Text>
      <Text style={sx.statValue} color="text/82">
        {value}
      </Text>
    </Box>
  );
}

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
  // fps has no catalog key of its own, so it folds onto the video-codec pair.
  push(t('stats.video'), [s.videoCodec, s.fps].filter(Boolean).join(' · '));
  push(t('stats.audio'), s.audioFormat);
  push(t('stats.avgBitrate'), s.bitrate);
  push(t('stats.buffer'), s.buffer);
  push(t('stats.droppedFrames'), s.dropped);
  for (const row of s.extra ?? []) {
    if (!row.group) push(row.label, row.value);
  }
  return { headline: s.mode, pairs };
}

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
  // Count of series in preceding charts, keeping palette slots distinct across the panel.
  slot: number;
}

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

// Computed rather than measured: the fixed panel width lets the SVG be sized
// without an extra layout pass on open.
function chartWidth(count: number, panelWidth: number): number {
  const inner = panelWidth - PANEL_PAD * 2;
  return Math.floor((inner - COL_GAP * (count - 1)) / count);
}

const PANEL_W = 768;
const PANEL_PAD = 22;
const COL_GAP = 26;
const PAIR_GAP = 14;

const sx = styles({
  // flexBasis is kept under a third of the inner width (724px): at exactly a
  // third, sub-pixel rounding tips the third column onto its own line.
  column: { flexBasis: 200, grow: 1, shrink: 1, minW: 180 },
  chartCell: { flexBasis: 0, minW: 0 },
  body: { gap: 16 },
  topRule: { borderTopWidth: 1, borderTopColor: 'tint/8', pt: 16 },
  headline: { font: 'ui', fontSize: 17, fontWeight: '700', color: 'text' },
  summaryPair: { font: 'ui', fontSize: 12, fontWeight: '500' },
  blockTitle: {
    font: 'ui',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  panelTitle: {
    font: 'ui',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.76,
    textTransform: 'uppercase',
  },
  statLabel: { font: 'ui', fontSize: 13, fontWeight: '500' },
  statValue: {
    font: 'ui',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
