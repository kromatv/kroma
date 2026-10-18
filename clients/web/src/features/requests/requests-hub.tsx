import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, PageHeader, SegmentGroup } from '@kromatv/ui/kit';
import { MissingList } from '#web/features/requests/missing';
import { MyRequestsList } from '#web/features/requests/my-requests';
import { PageFrame } from '#web/shared/ui';
import { UpcomingList } from '#web/shared/ui/upcoming-list';

export type RequestsTab = 'mine' | 'upcoming' | 'missing';

const TABS: readonly RequestsTab[] = ['mine', 'upcoming', 'missing'];

const LABEL: Record<RequestsTab, MessageKey> = {
  mine: 'requests.tab.mine',
  upcoming: 'requests.tab.upcoming',
  missing: 'requests.tab.missing',
};

/** A member's one page about what they asked for: the requests, what is due,
 *  and what is still missing. */
export function RequestsHubPage({
  tab,
  onTab,
}: Readonly<{ tab: RequestsTab; onTab: (tab: RequestsTab) => void }>) {
  const t = useT();
  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('requests.myTitle')}</PageHeader.Title>
      </PageHeader.Root>
      <Box mt={20} mb={20} align="flex-start">
        <SegmentGroup.Root
          value={tab}
          onValueChange={(next) => onTab(next as RequestsTab)}
          label={t('requests.myTitle')}
        >
          {TABS.map((one) => (
            <SegmentGroup.Item key={one} value={one}>
              <SegmentGroup.Label>{t(LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Box>
      {tab === 'mine' ? <MyRequestsList /> : null}
      {tab === 'upcoming' ? <UpcomingList /> : null}
      {tab === 'missing' ? <MissingList /> : null}
    </PageFrame>
  );
}
