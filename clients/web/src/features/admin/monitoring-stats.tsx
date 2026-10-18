import type { MonitoredSummary } from '@kromatv/client/monitoring';
import type { RequestKind } from '@kromatv/client/requests';
import { useT } from '@kromatv/ui';
import { Grid, Skeleton, StatCard, useBreakpoint } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

const NARROW_COLUMNS = 3;

export function StatGrid({ children }: Readonly<{ children: ReactNode }>) {
  const narrow = useBreakpoint() === 'base';
  if (narrow) {
    return (
      <Grid columns={NARROW_COLUMNS} gap={8}>
        {children}
      </Grid>
    );
  }
  return (
    <Grid min={200} gap={16}>
      {children}
    </Grid>
  );
}

export function Stat({
  label,
  value,
  unit,
  color,
  loading = false,
}: Readonly<{
  label: string;
  value: number;
  unit?: string;
  color?: string;
  loading?: boolean;
}>) {
  const narrow = useBreakpoint() === 'base';
  return (
    <StatCard.Root pad={narrow ? 'sm' : 'md'}>
      <StatCard.Label>{label}</StatCard.Label>
      {loading ? (
        <Skeleton w="70%" h={28} radius="sm" />
      ) : (
        <StatCard.Value unit={narrow ? undefined : unit} color={color}>
          {value}
        </StatCard.Value>
      )}
    </StatCard.Root>
  );
}

export function MonitoringStats({
  kind,
  monitored,
  onDisk,
}: Readonly<{ kind: RequestKind; monitored: MonitoredSummary; onDisk: number }>) {
  const t = useT();
  const unitKey = kind === 'show' ? 'monitoring.statEpisodes' : 'monitoring.statFiles';
  const unit = (count: number) => t(unitKey, { count });
  return (
    <StatGrid>
      {kind === 'show' ? (
        <Stat
          label={t('monitoring.statMonitored')}
          value={monitored.monitored}
          unit={unit(monitored.monitored)}
        />
      ) : null}
      <Stat
        label={t('monitoring.statOnDisk')}
        value={onDisk}
        unit={unit(onDisk)}
        color={onDisk > 0 ? 'success' : 'textDim'}
      />
      <Stat
        label={t('monitoring.colMissing')}
        value={monitored.missing}
        unit={unit(monitored.missing)}
        color={monitored.missing > 0 ? 'accentText' : 'success'}
      />
      {monitored.grabbed > 0 ? (
        <Stat
          label={t('monitoring.st.grabbed')}
          value={monitored.grabbed}
          unit={unit(monitored.grabbed)}
          color="info"
        />
      ) : null}
    </StatGrid>
  );
}
