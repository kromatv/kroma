import { useT } from '@kromatv/ui';
import { EmptyState, Pagination, Row } from '@kromatv/ui/kit';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePoll } from '#web/features/admin/hooks';
import { useCallerName } from '#web/features/admin/network-callers';
import { FlowFiltersBar } from '#web/features/admin/network-flow-filters';
import { FlowTable } from '#web/features/admin/network-flow-table';
import {
  callerChoices,
  FIRST_FLOW_PAGE,
  type FlowFilters,
  type FlowPosition,
  flowPageCount,
  flowPositionAt,
  flowQuery,
  NO_FLOW_FILTERS,
  purposeChoices,
} from '#web/features/admin/network-flows';
import { NetworkLoadFailed } from '#web/features/admin/network-load-failed';
import { useAuth } from '#web/shared/lib/auth';
import { useDebouncedValue } from '#web/shared/lib/use-debounced-value';
import { TableSkeleton } from '#web/shared/ui';

const FLOW_POLL_MS = 3000;
const HOST_SEARCH_DEBOUNCE_MS = 250;
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
  const [position, setPosition] = useState<FlowPosition>(FIRST_FLOW_PAGE);
  const host = useDebouncedValue(filters.host, HOST_SEARCH_DEBOUNCE_MS);
  const query = flowQuery({ ...filters, host }, position);

  const {
    data,
    isPending,
    isError: failed,
    error,
  } = useQuery({
    // Outside ['admin']: the console's event refresh would otherwise tick a paused journal.
    queryKey: ['network', 'flows', query],
    queryFn: () => client.network.flows(query),
    refetchInterval: live && position.page === 1 ? FLOW_POLL_MS : PAUSED,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const { data: rules } = usePoll(
    ['admin', 'network', 'rules'],
    () => client.network.rules(),
    RULES_POLL_MS,
  );

  const flows = data?.flows ?? [];
  const declared = rules?.purposes ?? [];
  const pageCount = flowPageCount(data?.total ?? 0);

  return (
    <>
      <FlowFiltersBar
        filters={filters}
        onFiltersChange={(next) => {
          setFilters(next);
          setPosition(FIRST_FLOW_PAGE);
        }}
        callers={callerChoices(declared, flows, filters.caller)}
        purposes={purposeChoices(declared, flows, filters.caller, filters.purpose)}
        callerName={callerName}
        live={live}
        onLiveChange={setLive}
      />
      {failed ? <NetworkLoadFailed error={error} /> : null}
      {isPending ? <TableSkeleton rows={8} /> : null}
      {data && flows.length === 0 ? (
        <EmptyState.Root icon="world">
          <EmptyState.Title>
            {isFiltered(filters) ? t('network.flowsNoMatch') : t('network.flowsEmpty')}
          </EmptyState.Title>
          <EmptyState.Hint>
            {isFiltered(filters) ? t('network.flowsNoMatchHint') : t('network.flowsEmptyHint')}
          </EmptyState.Hint>
        </EmptyState.Root>
      ) : null}
      {flows.length > 0 ? <FlowTable flows={flows} rules={rules?.rules ?? []} /> : null}
      {pageCount > 1 ? (
        <Row justify="flex-end" mt={14}>
          <Pagination.Root
            page={position.page}
            pageCount={pageCount}
            onPageChange={(next) => setPosition(flowPositionAt(next, position, flows))}
            label={t('network.tabConnections')}
          />
        </Row>
      ) : null}
    </>
  );
}
