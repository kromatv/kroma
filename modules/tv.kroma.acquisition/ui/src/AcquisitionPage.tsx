import {
  Denied,
  ModuleFailed,
  ModuleLoading,
  SettingsView,
  useCap,
  useT,
} from '@kromatv/module-sdk';
import { Box, PageHeader, SegmentGroup, Select, useBreakpoint } from '@kromatv/ui/kit';
import { useState } from 'react';
import { BlocklistView } from './blocklist-view';
import { CutoffView } from './cutoff-view';
import { FormatsView } from './formats-view';
import { ProfilesView } from './profiles-view';
import type { RulesView } from './rules-schemas';
import { RulesTestBox } from './rules-test-box';
import { SizesView } from './sizes-view';
import { useRules } from './use-rules';

const TABS = ['settings', 'profiles', 'formats', 'sizes', 'trial', 'cutoff', 'blocklist'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  settings: 'acq.tabSettings',
  profiles: 'acq.tabProfiles',
  formats: 'acq.tabFormats',
  sizes: 'acq.tabSizes',
  trial: 'acq.tabTrial',
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

      <TabPicker tab={tab} onPick={setTab} />

      <TabPanel tab={tab} />
    </Box>
  );
}

function TabPicker({ tab, onPick }: Readonly<{ tab: Tab; onPick: (next: Tab) => void }>) {
  const t = useT();
  if (useBreakpoint() === 'base') {
    return (
      <Select.Root
        label={t('acq.tabs')}
        value={tab}
        onValueChange={(next) => onPick(TABS.find((one) => one === next) ?? 'settings')}
      >
        <Select.Trigger block />
        {TABS.map((one) => (
          <Select.Item key={one} value={one} label={t(TAB_LABEL[one])} />
        ))}
      </Select.Root>
    );
  }
  return (
    <SegmentGroup.Root value={tab} onValueChange={onPick} label={t('acq.tabs')}>
      {TABS.map((one) => (
        <SegmentGroup.Item key={one} value={one}>
          <SegmentGroup.Label>{t(TAB_LABEL[one])}</SegmentGroup.Label>
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
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
    case 'trial':
      return <RulesTestBox />;
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
