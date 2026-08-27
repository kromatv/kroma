import { useFormat, useT } from '@kroma/module-sdk';
import type { ChartCurve, IconName } from '@kroma/ui/kit';
import { Box, Chart, Icon, Row, Surface, styles, Text } from '@kroma/ui/kit';
import { useMemo } from 'react';
import type { DownloadStatsView, SpeedSample } from './schemas';
import { useLiveStats } from './use-live-stats';

const STAT_TONES = { down: 'accent', up: 'success', active: 'text', peers: 'text' } as const;

const GAP = 10;
const PAIR_MIN = 360;
const TEXT_GAP = 2;
const SPARK_GAP = 8;
const SPARK_HEIGHT = 30;
const ZERO_LIFT_PX = 5;

const WINDOW_SAMPLES = 36;
const SCALE_HEADROOM = 1.15;
const QUIET_BPS = 128 * 1024;
const QUIET_COUNT = 4;

type StatTone = (typeof STAT_TONES)[keyof typeof STAT_TONES];
type SpeedField = Exclude<keyof SpeedSample, 'atMs'>;

const paintOf = (tone: StatTone) => (tone === 'text' ? 'glyphDim' : tone);

function floorFor(ceiling: number): number {
  return -ceiling * (ZERO_LIFT_PX / (SPARK_HEIGHT - ZERO_LIFT_PX));
}

function shareRatioOf(stats: DownloadStatsView): string | null {
  if (stats.totalDownloadedBytes <= 0) return null;
  return (stats.totalUploadedBytes / stats.totalDownloadedBytes).toFixed(2);
}

function rateFormat(fmt: ReturnType<typeof useFormat>) {
  return (bytes: number) => `${fmt.bytes(bytes)}/s`;
}

export function DownloadStats({ stats: polled }: Readonly<{ stats: DownloadStatsView }>) {
  const stats = useLiveStats(polled);
  const t = useT();
  const fmt = useFormat();
  const rate = rateFormat(fmt);

  const samples = useMemo(() => stats.history.slice(-WINDOW_SAMPLES), [stats.history]);
  const ratio = shareRatioOf(stats);
  const queued = (stats.byStatus.queued ?? 0) + (stats.byStatus.paused ?? 0);

  return (
    <Row wrap align="stretch" gap={GAP} mb={18}>
      <Row flex minW={PAIR_MIN} align="stretch" gap={GAP}>
        <StatTile
          icon="download"
          label={t('downloads.statDown')}
          value={rate(stats.downBps)}
          tone={STAT_TONES.down}
          foot={t('downloads.totalDown', { total: fmt.bytes(stats.totalDownloadedBytes) })}
          samples={samples}
          field="downBps"
          quietCeiling={QUIET_BPS}
          curve="monotone"
        />
        <StatTile
          icon="upload"
          label={t('downloads.statUp')}
          value={rate(stats.upBps)}
          tone={STAT_TONES.up}
          foot={
            ratio
              ? t('downloads.totalUpRatio', {
                  total: fmt.bytes(stats.totalUploadedBytes),
                  ratio,
                })
              : t('downloads.totalUp', { total: fmt.bytes(stats.totalUploadedBytes) })
          }
          samples={samples}
          field="upBps"
          quietCeiling={QUIET_BPS}
          curve="monotone"
        />
      </Row>
      <Row flex minW={PAIR_MIN} align="stretch" gap={GAP}>
        <StatTile
          icon="player-play"
          label={t('downloads.statActive')}
          value={String(stats.active)}
          tone={STAT_TONES.active}
          foot={t('downloads.waiting', { count: String(queued) })}
          samples={samples}
          field="active"
          quietCeiling={QUIET_COUNT}
          curve="linear"
        />
        <StatTile
          icon="users"
          label={t('downloads.statPeers')}
          value={String(stats.peers)}
          tone={STAT_TONES.peers}
          foot={t('downloads.peersFoot')}
          samples={samples}
          field="peers"
          quietCeiling={QUIET_COUNT}
          curve="linear"
        />
      </Row>
    </Row>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
  foot,
  samples,
  field,
  quietCeiling,
  curve,
}: Readonly<{
  icon: IconName;
  label: string;
  value: string;
  tone: StatTone;
  foot: string;
  samples: readonly SpeedSample[];
  field: SpeedField;
  quietCeiling: number;
  curve: ChartCurve;
}>) {
  const peak = samples.reduce((top, sample) => Math.max(top, sample[field]), 0);
  const ceiling = Math.max(peak * SCALE_HEADROOM, quietCeiling);
  const floor = floorFor(ceiling);
  const paint = paintOf(tone);

  return (
    <Surface elevated radius="xl" border="border" flex pad="none" px={12} py={10} gap={SPARK_GAP}>
      <Box gap={TEXT_GAP}>
        <Row gap={6}>
          <Icon name={icon} size={12} thickness={2} color={paint} />
          <Text variant="overline" color="textDim" lines={1}>
            {label}
          </Text>
        </Row>
        <Text variant="cardTitle" color={tone} style={s.value} lines={1}>
          {value}
        </Text>
        <Text variant="meta" color="text/35" lines={1}>
          {foot}
        </Text>
      </Box>
      <Chart.Root data={samples} height={SPARK_HEIGHT} min={floor} max={ceiling}>
        <Chart.Area series={field} color={paint} curve={curve} thickness={2} />
      </Chart.Root>
    </Surface>
  );
}

const s = styles({ value: { fontVariant: ['tabular-nums'] } });
