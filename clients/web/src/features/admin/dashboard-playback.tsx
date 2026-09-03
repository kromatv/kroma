import type { HistoryStats } from '@kroma/client/admin';
import { useFormat, useT } from '@kroma/ui';
import { Button, Row, Section } from '@kroma/ui/kit';
import { HistoryBars } from '#web/features/admin/charts';
import { useAccountOptions } from '#web/features/admin/dashboard-accounts';
import {
  ANY_KIND,
  daysOf,
  EVERYONE,
  FilterSelect,
  kindLabelKey,
  useChoice,
  useKindOptions,
  useRangeOptions,
  WATCH_KINDS,
  WATCH_RANGES,
} from '#web/features/admin/dashboard-filters';
import { kindTotals } from '#web/features/admin/dashboard-kind-totals';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { RouteLink } from '#web/shared/ui/route-link';

const POLL_MS = 60000;

const totalsOf = (stats: HistoryStats | null) =>
  kindTotals(stats?.totals, stats?.totalFilmsMs ?? 0, stats?.totalTvMs ?? 0);

export function PlaybackSection() {
  const t = useT();
  const fmt = useFormat();
  const { client } = useAuth();

  const range = useChoice(useRangeOptions(WATCH_RANGES), '30d');
  const kind = useChoice(useKindOptions(), ANY_KIND);
  const account = useChoice(useAccountOptions(), EVERYONE);

  const days = daysOf(range.value);
  const who = account.value === EVERYONE ? undefined : account.value;
  const what = kind.value === ANY_KIND ? undefined : kind.value;
  const { data } = usePoll(
    ['admin', 'playHistory', days, kind.value, account.value],
    () => client.admin.history({ days, kind: what, user: who }),
    POLL_MS,
  );

  const totals = totalsOf(data);
  const footer = t('admin.historyTotals', {
    totals: WATCH_KINDS.map((one) => `${t(kindLabelKey(one))} ${fmt.hours(totals[one])}`).join(
      ' · ',
    ),
  });

  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.playHistory')}</Section.Title>
        <Section.Actions>
          <Row gap={10}>
            <FilterSelect label={t('admin.colType')} choice={kind} />
            <FilterSelect label={t('admin.colUser')} choice={account} />
            <FilterSelect label={t('admin.playHistory')} choice={range} />
          </Row>
        </Section.Actions>
      </Section.Header>
      {data ? (
        <HistoryBars buckets={data.buckets} label={t('admin.playHistory')} footer={footer} />
      ) : null}
      <Row justify="flex-end" mt={14}>
        <Button variant="ghost" icon="arrow-right" label={t('admin.viewFullHistory')} asChild>
          <RouteLink to="/admin/history" search={{ range: range.value, user: who }} />
        </Button>
      </Row>
    </Section.Root>
  );
}
