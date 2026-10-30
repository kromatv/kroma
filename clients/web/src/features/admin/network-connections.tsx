import { useT } from '@kromatv/ui';
import { EmptyState } from '@kromatv/ui/kit';
import { useState } from 'react';
import { usePoll } from '#web/features/admin/hooks';
import { useCallerName } from '#web/features/admin/network-callers';
import { FlowFiltersBar } from '#web/features/admin/network-flow-filters';
import { FlowTable } from '#web/features/admin/network-flow-table';
import {
  callerChoices,
  type FlowFilters,
  flowQuery,
  matchingHost,
  NO_FLOW_FILTERS,
  purposeChoices,
} from '#web/features/admin/network-flows';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const FLOW_POLL_MS = 3000;
const RULES_POLL_MS = 60000;
const PAUSED = 0;

function isFiltered(filters: FlowFilters): boolean {
  return Boolean(
    filters.caller || filters.purpose || filters.host.trim() || filters.verdict !== 'all',
  );
}

export function NetworkConnections() {
  const t = useT();
  const { client } = useAuth();
  const callerName = useCallerName();
  const [filters, setFilters] = useState<FlowFilters>(NO_FLOW_FILTERS);
  const [live, setLive] = useState(true);
  const query = flowQuery(filters);

  const { data } = usePoll(
    // Outside ['admin']: the console's event refresh would otherwise tick a paused journal.
    ['network', 'flows', query],
    () => client.network.flows(query),
    live ? FLOW_POLL_MS : PAUSED,
  );
  const { data: rules } = usePoll(
    ['admin', 'network', 'rules'],
    () => client.network.rules(),
    RULES_POLL_MS,
  );

  const flows = data?.flows ?? [];
  const declared = rules?.purposes ?? [];
  const shown = matchingHost(flows, filters.host);

  return (
    <>
      <FlowFiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        callers={callerChoices(declared, flows, filters.caller)}
        purposes={purposeChoices(declared, flows, filters.caller, filters.purpose)}
        callerName={callerName}
        live={live}
        onLiveChange={setLive}
      />
      {data === null ? <TableSkeleton rows={8} /> : null}
      {data && shown.length === 0 ? (
        <EmptyState.Root icon="world">
          <EmptyState.Title>
            {isFiltered(filters) ? t('network.flowsNoMatch') : t('network.flowsEmpty')}
          </EmptyState.Title>
          <EmptyState.Hint>
            {isFiltered(filters) ? t('network.flowsNoMatchHint') : t('network.flowsEmptyHint')}
          </EmptyState.Hint>
        </EmptyState.Root>
      ) : null}
      {shown.length > 0 ? <FlowTable flows={shown} rules={rules?.rules ?? []} /> : null}
    </>
  );
}
