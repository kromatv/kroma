// The dashboard's three live metric sections. Each is the same plot over a
// different pair of the server's series, so what differs between them is only
// the scale, the unit and the roles the two colours stand for.

import type { MetricsSnapshot } from '@kroma/core';
import { useFormat, useT } from '@kroma/ui';
import { Section, Text } from '@kroma/ui/kit';
import { CHART_SERIES } from '#web/features/admin/chart-palette';
import { MetricsChart } from '#web/features/admin/charts';

type Metrics = Readonly<{ metrics: MetricsSnapshot | null }>;

const sampleSec = (metrics: MetricsSnapshot | null) => (metrics?.sampleIntervalMs ?? 3000) / 1000;

const avg = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const pct = (value: number) => `${Math.round(value)} %`;

function LiveLabel() {
  const t = useT();
  return (
    <Text variant="label" color="textMuted">
      {t('admin.realtime')}
    </Text>
  );
}

export function BandwidthSection({ metrics }: Metrics) {
  const t = useT();
  const fmt = useFormat();
  const local = metrics?.series.bwLocal ?? [];
  const remote = metrics?.series.bwRemote ?? [];
  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.bandwidth')}</Section.Title>
        <Section.Actions>
          <LiveLabel />
        </Section.Actions>
      </Section.Header>
      <MetricsChart
        max={Math.max(1, ...local, ...remote)}
        label={t('admin.bandwidth')}
        sampleSec={sampleSec(metrics)}
        formatValue={fmt.mbps}
        series={[
          {
            id: 'remote',
            label: t('admin.legendRemote'),
            data: remote,
            color: CHART_SERIES.remote,
          },
          {
            id: 'local',
            label: t('admin.legendLocal'),
            data: local,
            color: CHART_SERIES.local,
            fill: true,
          },
        ]}
        footer={t('admin.bwAverages', {
          remote: fmt.mbps(avg(remote)),
          local: fmt.mbps(avg(local)),
        })}
      />
    </Section.Root>
  );
}

export function CpuSection({ metrics }: Metrics) {
  const t = useT();
  const fmt = useFormat();
  const kroma = metrics?.series.cpuKroma ?? [];
  const sys = metrics?.series.cpuSystem ?? [];
  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.cpu')}</Section.Title>
        <Section.Actions>
          <LiveLabel />
        </Section.Actions>
      </Section.Header>
      <MetricsChart
        max={100}
        label={t('admin.cpu')}
        sampleSec={sampleSec(metrics)}
        formatValue={pct}
        series={[
          { id: 'sys', label: t('admin.legendSystem'), data: sys, color: CHART_SERIES.cpuSystem },
          {
            id: 'kroma',
            label: t('admin.legendKromaServer'),
            data: kroma,
            color: CHART_SERIES.kroma,
          },
        ]}
        footer={t('admin.cpuAverages', {
          kroma: fmt.decimal(avg(kroma), 1),
          sys: fmt.decimal(avg(sys), 1),
        })}
      />
    </Section.Root>
  );
}

export function RamSection({ metrics }: Metrics) {
  const t = useT();
  const fmt = useFormat();
  const kroma = metrics?.series.ramKroma ?? [];
  const sys = metrics?.series.ramSystem ?? [];
  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.ram')}</Section.Title>
        <Section.Actions>
          <LiveLabel />
        </Section.Actions>
      </Section.Header>
      <MetricsChart
        max={100}
        label={t('admin.ram')}
        sampleSec={sampleSec(metrics)}
        formatValue={pct}
        series={[
          { id: 'sys', label: t('admin.legendSystem'), data: sys, color: CHART_SERIES.ramSystem },
          {
            id: 'kroma',
            label: t('admin.legendKromaServer'),
            data: kroma,
            color: CHART_SERIES.kroma,
          },
        ]}
        footer={t('admin.ramAverages', {
          kroma: fmt.decimal(avg(kroma), 2),
          sys: fmt.decimal(avg(sys), 2),
        })}
      />
    </Section.Root>
  );
}
