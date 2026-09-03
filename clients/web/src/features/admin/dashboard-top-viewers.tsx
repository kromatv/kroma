import { useT } from '@kroma/ui';
import { EmptyState, Grid, Pagination, Row, Section } from '@kroma/ui/kit';
import { useState } from 'react';
import {
  daysOf,
  FilterSelect,
  useChoice,
  useRangeOptions,
  WATCH_RANGES,
} from '#web/features/admin/dashboard-filters';
import { TopViewerCard } from '#web/features/admin/dashboard-top-viewer-card';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const CARDS_PER_PAGE = 6;
const POLL_MS = 30000;

export function TopViewersSection() {
  const t = useT();
  const { client } = useAuth();
  const range = useChoice(useRangeOptions(WATCH_RANGES), '7d');
  const [page, setPage] = useState(1);
  const { data } = usePoll(
    ['admin', 'topUsers', range.value],
    () => client.admin.topUsers(daysOf(range.value)),
    POLL_MS,
  );

  const users = data?.users ?? [];
  const pageCount = Math.max(1, Math.ceil(users.length / CARDS_PER_PAGE));
  const at = Math.min(page, pageCount);
  const shown = users.slice((at - 1) * CARDS_PER_PAGE, at * CARDS_PER_PAGE);

  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.topUsers')}</Section.Title>
        <Section.Actions>
          <FilterSelect label={t('admin.topUsers')} choice={range} />
        </Section.Actions>
      </Section.Header>
      {users.length > 0 ? (
        <Grid min={220} gap={16}>
          {shown.map((user) => (
            <TopViewerCard key={user.userId ?? user.username} user={user} />
          ))}
        </Grid>
      ) : null}
      {pageCount > 1 ? (
        <Row justify="flex-end" mt={16}>
          <Pagination.Root
            page={at}
            pageCount={pageCount}
            onPageChange={setPage}
            label={t('admin.topUsers')}
          />
        </Row>
      ) : null}
      {data && users.length === 0 ? (
        <EmptyState.Root size="sm" icon="users">
          <EmptyState.Title>{t('admin.topUsersEmpty')}</EmptyState.Title>
        </EmptyState.Root>
      ) : null}
    </Section.Root>
  );
}
