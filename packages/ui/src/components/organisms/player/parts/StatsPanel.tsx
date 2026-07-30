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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={BODY}>
        <SummaryBlock headline={summary.headline} pairs={summary.pairs} />

        {charts.length > 0 ? (
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

// The memo comparators below compare by CONTENT: every array and tuple these
// take is freshly allocated on each poll, so a default memo would never hit.
function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, at) => value === b[at]);
}

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

const CARD = 'rgba(10, 10, 12, 0.94)';

// flexBasis is kept under a third of the inner width (724px): at exactly a
// third, sub-pixel rounding tips the third column onto its own line.
const COLUMN = { flexBasis: 200, flexGrow: 1, flexShrink: 1, minWidth: 180 } as const;
const CHART_CELL = { flexBasis: 0, minWidth: 0 } as const;
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
