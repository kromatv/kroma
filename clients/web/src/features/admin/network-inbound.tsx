import type { InboundSummary } from '@kromatv/client/network';
import { useFormat, useT } from '@kromatv/ui';
import { Box, EmptyState } from '@kromatv/ui/kit';
import { useState } from 'react';
import { usePoll } from '#web/features/admin/hooks';
import type { SummaryWindow } from '#web/features/admin/network-host-groups';
import { InboundTable } from '#web/features/admin/network-inbound-table';
import { NetworkLoadFailed } from '#web/features/admin/network-load-failed';
import { NetworkStatGrid } from '#web/features/admin/network-stat-grid';
import { WindowSelect } from '#web/features/admin/network-window-select';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const INBOUND_POLL_MS = 30000;

function Totals({ summary }: Readonly<{ summary: InboundSummary }>) {
  const fmt = useFormat();
  const { totals } = summary;
  return (
    <NetworkStatGrid
      stats={[
        { labelKey: 'network.statRequests', value: totals.requests },
        { labelKey: 'network.statClients', value: totals.addresses },
        { labelKey: 'network.statIn', value: fmt.bytes(totals.bytesIn) },
        { labelKey: 'network.statOut', value: fmt.bytes(totals.bytesOut) },
      ]}
    />
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
  const rows = data?.rows ?? [];

  return (
    <Box gap={20}>
      <Box align="flex-start">
        <WindowSelect value={days} onValueChange={setDays} />
      </Box>
      {failed ? <NetworkLoadFailed error={error} /> : null}
      {data ? <Totals summary={data} /> : null}
      {data === null && !failed ? <TableSkeleton rows={6} /> : null}
      {data && rows.length === 0 ? (
        <EmptyState.Root icon="devices">
          <EmptyState.Title>{t('network.inboundEmpty')}</EmptyState.Title>
          <EmptyState.Hint>{t('network.inboundEmptyHint')}</EmptyState.Hint>
        </EmptyState.Root>
      ) : null}
      {rows.length > 0 ? <InboundTable rows={rows} /> : null}
    </Box>
  );
}
