import type { NetworkSummary } from '@kromatv/client/network';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Callout, EmptyState } from '@kromatv/ui/kit';
import { useMemo, useState } from 'react';
import { usePoll } from '#web/features/admin/hooks';
import { DestinationTable } from '#web/features/admin/network-destination-table';
import { groupByHost, type SummaryWindow } from '#web/features/admin/network-host-groups';
import { useHostRule } from '#web/features/admin/network-host-rule';
import { NetworkLoadFailed } from '#web/features/admin/network-load-failed';
import { NetworkStatGrid } from '#web/features/admin/network-stat-grid';
import { WindowSelect } from '#web/features/admin/network-window-select';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const SUMMARY_POLL_MS = 30000;

function Totals({ summary }: Readonly<{ summary: NetworkSummary }>) {
  const fmt = useFormat();
  const { totals } = summary;
  return (
    <NetworkStatGrid
      stats={[
        { labelKey: 'network.statFlows', value: totals.flows },
        {
          labelKey: 'network.statBlocked',
          value: totals.blocked,
          color: totals.blocked > 0 ? 'danger' : 'text',
        },
        { labelKey: 'network.statIn', value: fmt.bytes(totals.bytesIn) },
        { labelKey: 'network.statOut', value: fmt.bytes(totals.bytesOut) },
      ]}
    />
  );
}

export function NetworkDestinations() {
  const t = useT();
  const { client } = useAuth();
  const [days, setDays] = useState<SummaryWindow>(7);
  const { data, failed, error } = usePoll(
    ['admin', 'network', 'summary', days],
    () => client.network.summary(days),
    SUMMARY_POLL_MS,
  );
  const groups = useMemo(() => groupByHost(data?.rows ?? []), [data]);
  const hostRule = useHostRule();

  return (
    <Box gap={20}>
      <Box align="flex-start">
        <WindowSelect value={days} onValueChange={setDays} />
      </Box>
      {hostRule.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{hostRule.error}</Callout.Title>
        </Callout.Root>
      ) : null}
      {failed ? <NetworkLoadFailed error={error} /> : null}
      {data ? <Totals summary={data} /> : null}
      {data === null && !failed ? <TableSkeleton rows={6} /> : null}
      {data && groups.length === 0 ? (
        <EmptyState.Root icon="world">
          <EmptyState.Title>{t('network.destinationsEmpty')}</EmptyState.Title>
          <EmptyState.Hint>{t('network.destinationsEmptyHint')}</EmptyState.Hint>
        </EmptyState.Root>
      ) : null}
      {groups.length > 0 ? (
        <DestinationTable
          groups={groups}
          onHostAction={(host, action) => void hostRule.apply(host, action)}
        />
      ) : null}
    </Box>
  );
}
