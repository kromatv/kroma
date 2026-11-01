import type { InboundSummary } from '@kromatv/client/network';
import { useFormat, useT } from '@kromatv/ui';
import { Box, EmptyState, Grid, StatCard } from '@kromatv/ui/kit';
import { useState } from 'react';
import { usePoll } from '#web/features/admin/hooks';
import type { SummaryWindow } from '#web/features/admin/network-host-groups';
import { InboundTable } from '#web/features/admin/network-inbound-table';
import { NetworkLoadFailed } from '#web/features/admin/network-load-failed';
import { WindowSelect } from '#web/features/admin/network-window-select';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const INBOUND_POLL_MS = 30000;

function Totals({ summary }: Readonly<{ summary: InboundSummary }>) {
  const t = useT();
  const fmt = useFormat();
  const { totals } = summary;
  return (
    <Grid min={180} gap={16}>
      <StatCard.Root>
        <StatCard.Label>{t('network.statRequests')}</StatCard.Label>
        <StatCard.Value>{totals.requests}</StatCard.Value>
      </StatCard.Root>
      <StatCard.Root>
        <StatCard.Label>{t('network.statClients')}</StatCard.Label>
        <StatCard.Value>{totals.addresses}</StatCard.Value>
      </StatCard.Root>
      <StatCard.Root>
        <StatCard.Label>{t('network.statIn')}</StatCard.Label>
        <StatCard.Value>{fmt.bytes(totals.bytesIn)}</StatCard.Value>
      </StatCard.Root>
      <StatCard.Root>
        <StatCard.Label>{t('network.statOut')}</StatCard.Label>
        <StatCard.Value>{fmt.bytes(totals.bytesOut)}</StatCard.Value>
      </StatCard.Root>
    </Grid>
  );
}

export function NetworkInbound() {
  const t = useT();
  const { client } = useAuth();
  const [days, setDays] = useState<SummaryWindow>(7);
  const { data, failed, error } = usePoll(
    ['admin', 'network', 'inbound', days],
    () => client.network.inbound(days),
    INBOUND_POLL_MS,
  );

  return (
    <Box gap={20}>
      <Box align="flex-start">
        <WindowSelect value={days} onValueChange={setDays} />
      </Box>
      {failed ? <NetworkLoadFailed error={error} /> : null}
      {data ? <Totals summary={data} /> : null}
      {data === null && !failed ? <TableSkeleton rows={6} /> : null}
      {data && data.rows.length === 0 ? (
        <EmptyState.Root icon="devices">
          <EmptyState.Title>{t('network.inboundEmpty')}</EmptyState.Title>
          <EmptyState.Hint>{t('network.inboundEmptyHint')}</EmptyState.Hint>
        </EmptyState.Root>
      ) : null}
      {data && data.rows.length > 0 ? <InboundTable rows={data.rows} /> : null}
    </Box>
  );
}
