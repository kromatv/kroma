import { useT } from '@kromatv/ui';
import { PageHeader } from '@kromatv/ui/kit';
import { PageFrame } from '#web/shared/ui';
import { UpcomingList } from '#web/shared/ui/upcoming-list';

export function ComingSoonPage() {
  const t = useT();
  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('requests.calendarTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('requests.calendarSubtitle')}</PageHeader.Subtitle>
      </PageHeader.Root>
      <UpcomingList />
    </PageFrame>
  );
}
