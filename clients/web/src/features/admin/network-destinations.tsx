import type { NetworkSummary } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Callout, EmptyState, Grid, SegmentGroup, StatCard } from '@kromatv/ui/kit';
import { useMemo, useState } from 'react';
import { usePoll } from '#web/features/admin/hooks';
import { DestinationTable } from '#web/features/admin/network-destination-table';
import {
  groupByHost,
  SUMMARY_WINDOWS,
  type SummaryWindow,
} from '#web/features/admin/network-host-groups';
import { useHostRule } from '#web/features/admin/network-host-rule';
import { NetworkLoadFailed } from '#web/features/admin/network-load-failed';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const SUMMARY_POLL_MS = 30000;

const WINDOW_LABEL: Record<SummaryWindow, MessageKey> = {
  1: 'network.window1',
  7: 'network.window7',
  30: 'network.window30',
};

function Totals({ summary }: Readonly<{ summary: NetworkSummary }>) {
  const t = useT();
  const fmt = useFormat();
  const { totals } = summary;
  return (
    <Grid min={180} gap={16}>
      <StatCard.Root>
        <StatCard.Label>{t('network.statFlows')}</StatCard.Label>
        <StatCard.Value>{totals.flows}</StatCard.Value>
      </StatCard.Root>
      <StatCard.Root>
        <StatCard.Label>{t('network.statBlocked')}</StatCard.Label>
        <StatCard.Value color={totals.blocked > 0 ? 'danger' : 'text'}>
          {totals.blocked}
        </StatCard.Value>
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
        <SegmentGroup.Root
          label={t('network.window')}
          value={String(days)}
          onValueChange={(next) =>
            setDays(SUMMARY_WINDOWS.find((one) => String(one) === next) ?? 7)
          }
        >
          {SUMMARY_WINDOWS.map((one) => (
            <SegmentGroup.Item key={one} value={String(one)}>
              <SegmentGroup.Label>{t(WINDOW_LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
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
