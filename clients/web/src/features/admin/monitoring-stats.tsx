import type { MonitoredSummary } from '@kromatv/client/monitoring';
import type { RequestKind } from '@kromatv/client/requests';
import { useT } from '@kromatv/ui';
import { Grid, StatCard } from '@kromatv/ui/kit';

export function MonitoringStats({
  kind,
  monitored,
}: Readonly<{ kind: RequestKind; monitored: MonitoredSummary }>) {
  const t = useT();
  const unitKey = kind === 'show' ? 'monitoring.statEpisodes' : 'monitoring.statFiles';
  const unit = (count: number) => t(unitKey, { count });
  return (
    <Grid min={200} gap={16}>
      {kind === 'show' ? (
        <StatCard.Root>
          <StatCard.Label>{t('monitoring.statMonitored')}</StatCard.Label>
          <StatCard.Value unit={unit(monitored.monitored)}>{monitored.monitored}</StatCard.Value>
        </StatCard.Root>
      ) : null}
      <StatCard.Root>
        <StatCard.Label>{t('monitoring.statOnDisk')}</StatCard.Label>
        <StatCard.Value
          unit={unit(monitored.available)}
          color={monitored.available > 0 ? 'success' : 'textDim'}
        >
          {monitored.available}
        </StatCard.Value>
      </StatCard.Root>
      <StatCard.Root>
        <StatCard.Label>{t('monitoring.colMissing')}</StatCard.Label>
        <StatCard.Value
          unit={unit(monitored.missing)}
          color={monitored.missing > 0 ? 'accentText' : 'success'}
        >
          {monitored.missing}
        </StatCard.Value>
      </StatCard.Root>
      {monitored.grabbed > 0 ? (
        <StatCard.Root>
          <StatCard.Label>{t('monitoring.st.grabbed')}</StatCard.Label>
          <StatCard.Value unit={unit(monitored.grabbed)} color="info">
            {monitored.grabbed}
          </StatCard.Value>
        </StatCard.Root>
      ) : null}
    </Grid>
  );
}
