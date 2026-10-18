import type { MessageKey } from '@kromatv/i18n';
import { ModuleSlot, useSlotFilled } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, SegmentGroup } from '@kromatv/ui/kit';
import type { LibraryState } from '#web/features/admin/monitoring-index-model';
import { LibraryTitles } from '#web/features/admin/monitoring-list';
import { RequestsQueue } from '#web/features/admin/requests-queue';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';
import { UpcomingList } from '#web/shared/ui/upcoming-list';

export type LibraryTab = 'titles' | 'upgrades' | 'upcoming' | 'requests';

const LABEL: Record<LibraryTab, MessageKey> = {
  titles: 'monitoring.tab.titles',
  upgrades: 'monitoring.tab.upgrades',
  upcoming: 'monitoring.tab.upcoming',
  requests: 'monitoring.tab.requests',
};

/** The one page an admin manages the library from: every title, what is due,
 *  and what people asked for, each a tab of the same page. */
export function LibraryHubPage({
  tab,
  view,
  onTab,
  onView,
}: Readonly<{
  tab: LibraryTab;
  view: LibraryState;
  onTab: (tab: LibraryTab) => void;
  onView: (view: LibraryState) => void;
}>) {
  const t = useT();
  const library = useCap('library.manage');
  const requests = useCap('requests.manage');
  const upgrades = useSlotFilled('library.upgrades');
  const tabs: LibraryTab[] = [
    ...(library ? (['titles'] as const) : []),
    ...(library && upgrades ? (['upgrades'] as const) : []),
    ...(library ? (['upcoming'] as const) : []),
    ...(requests ? (['requests'] as const) : []),
  ];
  if (tabs.length === 0) return <Denied />;
  const shown = tabs.includes(tab) ? tab : (tabs[0] as LibraryTab);
  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('monitoring.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('monitoring.subtitle')}</PageHeader.Subtitle>
      </PageHeader.Root>
      <Box mt={20} mb={20} align="flex-start">
        <SegmentGroup.Root
          value={shown}
          onValueChange={(next) => onTab(next as LibraryTab)}
          label={t('monitoring.title')}
        >
          {tabs.map((one) => (
            <SegmentGroup.Item key={one} value={one}>
              <SegmentGroup.Label>{t(LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Box>
      {shown === 'titles' ? <LibraryTitles view={view} onView={onView} /> : null}
      {shown === 'upgrades' ? <ModuleSlot name="library.upgrades" /> : null}
      {shown === 'upcoming' ? <UpcomingList /> : null}
      {shown === 'requests' ? <RequestsQueue /> : null}
    </>
  );
}
