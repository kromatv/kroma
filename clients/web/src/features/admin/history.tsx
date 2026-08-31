import type { MessageKey, PlayEntry } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Pagination, Row } from '@kroma/ui/kit';
import { useMemo } from 'react';
import { HISTORY_COLUMNS, ITEM_HISTORY_COLUMNS } from '#web/features/admin/history-columns';
import { HistoryFilters } from '#web/features/admin/history-filters';
import {
  HISTORY_PAGE,
  type HistorySearch,
  historyOrderedBy,
  historyRequest,
  historySort,
} from '#web/features/admin/history-query';
import { HistoryTable } from '#web/features/admin/history-table';
import { Denied, PageHeader, useCap, usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const PLAYS_POLL_MS = 30000;
const FILTER_POLL_MS = 60000;

interface HistoryScreenProps {
  search: HistorySearch;
  onSearchChange: (next: HistorySearch) => void;
}

export function HistoryScreen(props: Readonly<HistoryScreenProps>) {
  if (!useCap('users.manage')) return <Denied />;
  return <HistoryPageInner {...props} />;
}

function titleOf(plays: readonly PlayEntry[]): string | null {
  const first = plays[0];
  if (!first) return null;
  return first.showTitle ?? first.title;
}

function HistoryPageInner({ search, onSearchChange }: Readonly<HistoryScreenProps>) {
  const t = useT();
  const { client } = useAuth();
  const request = useMemo(() => historyRequest(search), [search]);

  const { data } = usePoll(
    ['admin', 'plays', request],
    () => client.adminPlays(request),
    PLAYS_POLL_MS,
  );
  const { data: users } = usePoll(['admin', 'users'], () => client.adminUsers(), FILTER_POLL_MS);
  const { data: libraries } = usePoll(
    ['admin', 'libraries'],
    () => client.adminLibraries(),
    FILTER_POLL_MS,
  );

  const plays = data?.plays ?? [];
  const total = data?.total ?? 0;
  const page = search.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE));
  const oneTitle = search.item !== undefined;
  const columns = oneTitle ? ITEM_HISTORY_COLUMNS : HISTORY_COLUMNS;

  const named = oneTitle ? titleOf(plays) : null;
  const emptyKey: MessageKey = oneTitle ? 'admin.itemHistoryEmpty' : 'admin.noHistory';
  const count = oneTitle
    ? t('admin.plays', { count: total })
    : t('admin.historyMatching', { count: total });

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title suffix={count}>{named ?? t('admin.historyScreen')}</PageHeader.Title>
        {oneTitle ? null : <PageHeader.Subtitle>{t('admin.historyScreenSub')}</PageHeader.Subtitle>}
        <PageHeader.Actions>
          <HistoryFilters
            search={search}
            libraries={libraries?.libraries ?? []}
            users={users?.users ?? []}
            pinnedTitle={named}
            onSearchChange={onSearchChange}
          />
        </PageHeader.Actions>
      </PageHeader.Root>

      <Box mt={24}>
        <HistoryTable
          columns={columns}
          plays={plays}
          sort={historySort(search)}
          onSortChange={(next) => onSearchChange(historyOrderedBy(search, next))}
          emptyKey={emptyKey}
          loaded={data !== null}
        />
      </Box>

      {pageCount > 1 ? (
        <Row justify="flex-end" mt={14}>
          <Pagination.Root
            page={page}
            pageCount={pageCount}
            onPageChange={(next) => onSearchChange({ ...search, page: next })}
            label={t('admin.historyScreen')}
          />
        </Row>
      ) : null}
    </>
  );
}
