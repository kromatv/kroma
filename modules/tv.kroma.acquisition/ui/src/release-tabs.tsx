import { useT } from '@kromatv/module-sdk';
import { SegmentGroup } from '@kromatv/ui/kit';
import { RELEASE_TABS, type ReleaseTab, releaseTabOf } from './release-tab';
import type { ReleaseView } from './use-release-view';

const TAB_LABEL: Record<ReleaseTab, string> = {
  accepted: 'acq.tab.accepted',
  refused: 'acq.tab.refused',
  all: 'acq.tab.all',
};

export function ReleaseTabs({ view }: Readonly<{ view: ReleaseView }>) {
  const t = useT();
  return (
    <SegmentGroup.Root
      value={view.tab}
      onValueChange={(next: string) => {
        const picked = releaseTabOf(next);
        if (picked) view.setTab(picked);
      }}
      label={t('acq.releaseTabs')}
      size="sm"
    >
      {RELEASE_TABS.map((one) => (
        <SegmentGroup.Item key={one} value={one}>
          <SegmentGroup.Label>{t(TAB_LABEL[one], { count: view.counts[one] })}</SegmentGroup.Label>
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}
