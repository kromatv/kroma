import {
  Denied,
  ModuleFailed,
  ModuleLoading,
  SettingsView,
  useCap,
  useT,
} from '@kromatv/module-sdk';
import { Box, PageHeader, SegmentGroup } from '@kromatv/ui/kit';
import { useState } from 'react';
import { BlocklistView } from './blocklist-view';
import { CutoffView } from './cutoff-view';
import { FormatsView } from './formats-view';
import { ProfilesView } from './profiles-view';
import type { RulesView } from './rules-schemas';
import { SizesView } from './sizes-view';
import { useRules } from './use-rules';

const TABS = ['settings', 'profiles', 'formats', 'sizes', 'cutoff', 'blocklist'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  settings: 'acq.tabSettings',
  profiles: 'acq.tabProfiles',
  formats: 'acq.tabFormats',
  sizes: 'acq.tabSizes',
  cutoff: 'acq.tabCutoff',
  blocklist: 'acq.tabBlocklist',
};

export default function AcquisitionPage() {
  const t = useT();
  const allowed = useCap('settings.manage');
  const [tab, setTab] = useState<Tab>('settings');
  if (!allowed) return <Denied />;
  return (
    <Box gap={24}>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.pageAcquisition')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.pageAcquisitionSub')}</PageHeader.Subtitle>
      </PageHeader.Root>

      <SegmentGroup.Root value={tab} onValueChange={setTab} label={t('acq.tabs')}>
        {TABS.map((one) => (
          <SegmentGroup.Item key={one} value={one}>
            <SegmentGroup.Label>{t(TAB_LABEL[one])}</SegmentGroup.Label>
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>

      <TabPanel tab={tab} />
    </Box>
  );
}

function TabPanel({ tab }: Readonly<{ tab: Tab }>) {
  switch (tab) {
    case 'settings':
      return (
        <SettingsView
          view="acquisition"
          titleKey="admin.pageAcquisition"
          subtitleKey="admin.pageAcquisitionSub"
          embedded
        />
      );
    case 'cutoff':
      return <CutoffView />;
    case 'blocklist':
      return <BlocklistView />;
    default:
      return <RulesPanel tab={tab} />;
  }
}

function RulesPanel({ tab }: Readonly<{ tab: RulesTab }>) {
  const rules = useRules();
  if (rules.loading) return <ModuleLoading panels={2} />;
  if (rules.failed || !rules.data) {
    return <ModuleFailed error={rules.error} retry={() => void rules.reload()} />;
  }
  return <RulesTabPanel tab={tab} rules={rules.data} onSaved={rules.reload} />;
}

type RulesTab = 'profiles' | 'formats' | 'sizes';

function RulesTabPanel({
  tab,
  rules,
  onSaved,
}: Readonly<{ tab: RulesTab; rules: RulesView; onSaved: () => Promise<void> }>) {
  switch (tab) {
    case 'profiles':
      return <ProfilesView rules={rules} onSaved={onSaved} />;
    case 'formats':
      return <FormatsView rules={rules} onSaved={onSaved} />;
    case 'sizes':
      return <SizesView rules={rules} onSaved={onSaved} />;
  }
}
