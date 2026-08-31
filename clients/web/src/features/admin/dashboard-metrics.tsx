import type { MetricsSnapshot } from '@kroma/core';
import { useFormat, useT } from '@kroma/ui';
import { CHART_SERIES } from '#web/features/admin/chart-palette';
import { MetricsChart, type MetricsSeries } from '#web/features/admin/charts';
import {
  meanOf,
  ResourceSection,
  startedAtOf,
  stepSecOf,
  useMetricsWindow,
  useScopeChoice,
} from '#web/features/admin/dashboard-resource-panel';

const BANDWIDTH_SCOPES = ['all', 'local', 'remote'] as const;
const HOST_SCOPES = ['all', 'kroma', 'system'] as const;

const HOST_MAX = 100;

type Scoped<S extends string> = MetricsSeries & { of: S };

function drawn<S extends string>(series: readonly Scoped<S>[], scope: S | 'all'): MetricsSeries[] {
  return series.filter((one) => scope === 'all' || one.of === scope);
}

const pct = (value: number) => `${Math.round(value)} %`;

const isComplete = (metrics: MetricsSnapshot | null) => metrics?.complete !== false;

export function BandwidthSection() {
  const t = useT();
  const fmt = useFormat();
  const scope = useScopeChoice(BANDWIDTH_SCOPES);
  const { range, metrics } = useMetricsWindow();
  const local = metrics?.series.bwLocal ?? [];
  const remote = metrics?.series.bwRemote ?? [];
  const shown = drawn(
    [
      {
        field: 'remote',
        of: 'remote',
        label: t('admin.legendRemote'),
        data: remote,
        color: CHART_SERIES.remote,
      },
      {
        field: 'local',
        of: 'local',
        label: t('admin.legendLocal'),
        data: local,
        color: CHART_SERIES.local,
        fill: true,
      },
    ],
    scope.value,
  );
  return (
    <ResourceSection
      title={t('admin.bandwidth')}
      scope={scope}
      range={range}
      complete={isComplete(metrics)}
    >
      <MetricsChart
        max={Math.max(1, ...shown.flatMap((one) => one.data))}
        label={t('admin.bandwidth')}
        startedAtSec={startedAtOf(metrics)}
        stepSec={stepSecOf(metrics)}
        formatValue={fmt.mbps}
        series={shown}
        footer={t('admin.bwAverages', {
          remote: fmt.mbps(meanOf(metrics?.means?.bwRemote, remote)),
          local: fmt.mbps(meanOf(metrics?.means?.bwLocal, local)),
        })}
      />
    </ResourceSection>
  );
}

export function CpuSection() {
  const t = useT();
  const fmt = useFormat();
  const scope = useScopeChoice(HOST_SCOPES);
  const { range, metrics } = useMetricsWindow();
  const kroma = metrics?.series.cpuKroma ?? [];
  const system = metrics?.series.cpuSystem ?? [];
  const media = metrics?.series.cpuMedia ?? [];
  return (
    <ResourceSection
      title={t('admin.cpu')}
      scope={scope}
      range={range}
      complete={isComplete(metrics)}
    >
      <MetricsChart
        max={HOST_MAX}
        label={t('admin.cpu')}
        startedAtSec={startedAtOf(metrics)}
        stepSec={stepSecOf(metrics)}
        formatValue={pct}
        series={drawn(
          [
            {
              field: 'sys',
              of: 'system',
              label: t('admin.legendSystem'),
              data: system,
              color: CHART_SERIES.cpuSystem,
            },
            {
              field: 'kroma',
              of: 'kroma',
              label: t('admin.legendKromaServer'),
              data: kroma,
              color: CHART_SERIES.kroma,
            },
            {
              field: 'media',
              of: 'kroma',
              label: t('admin.legendTranscoding'),
              data: media,
              color: CHART_SERIES.cpuMedia,
              fill: true,
            },
          ],
          scope.value,
        )}
        footer={t('admin.cpuAveragesWithMedia', {
          kroma: fmt.decimal(meanOf(metrics?.means?.cpuKroma, kroma), 1),
          media: fmt.decimal(meanOf(metrics?.means?.cpuMedia, media), 1),
          sys: fmt.decimal(meanOf(metrics?.means?.cpuSystem, system), 1),
        })}
      />
    </ResourceSection>
  );
}

export function RamSection() {
  const t = useT();
  const fmt = useFormat();
  const scope = useScopeChoice(HOST_SCOPES);
  const { range, metrics } = useMetricsWindow();
  const kroma = metrics?.series.ramKroma ?? [];
  const system = metrics?.series.ramSystem ?? [];
  return (
    <ResourceSection
      title={t('admin.ram')}
      scope={scope}
      range={range}
      complete={isComplete(metrics)}
    >
      <MetricsChart
        max={HOST_MAX}
        label={t('admin.ram')}
        startedAtSec={startedAtOf(metrics)}
        stepSec={stepSecOf(metrics)}
        formatValue={pct}
        series={drawn(
          [
            {
              field: 'sys',
              of: 'system',
              label: t('admin.legendSystem'),
              data: system,
              color: CHART_SERIES.ramSystem,
            },
            {
              field: 'kroma',
              of: 'kroma',
              label: t('admin.legendKromaServer'),
              data: kroma,
              color: CHART_SERIES.kroma,
            },
          ],
          scope.value,
        )}
        footer={t('admin.ramAverages', {
          kroma: fmt.decimal(meanOf(metrics?.means?.ramKroma, kroma), 2),
          sys: fmt.decimal(meanOf(metrics?.means?.ramSystem, system), 2),
        })}
      />
    </ResourceSection>
  );
}
