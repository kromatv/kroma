import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, SegmentGroup, useConfirm } from '@kromatv/ui/kit';
import { useBlocker } from '@tanstack/react-router';
import { useState } from 'react';
import { NetworkConnections } from '#web/features/admin/network-connections';
import { NetworkDestinations } from '#web/features/admin/network-destinations';
import { NetworkListeners } from '#web/features/admin/network-listeners';
import { RuleEditor } from '#web/features/admin/network-rule-editor';
import { SettingsPage } from '#web/features/admin/settings';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';

export const NETWORK_TABS = [
  'connections',
  'destinations',
  'rules',
  'listeners',
  'settings',
] as const;
type NetworkTab = (typeof NETWORK_TABS)[number];

const LABEL: Record<NetworkTab, MessageKey> = {
  connections: 'network.tabConnections',
  destinations: 'network.tabDestinations',
  rules: 'network.tabRules',
  listeners: 'network.tabListeners',
  settings: 'network.tabSettings',
};

function isNetworkTab(value: string): value is NetworkTab {
  return (NETWORK_TABS as readonly string[]).includes(value);
}

interface NetworkPageProps {
  tab: NetworkTab;
  onTab: (tab: NetworkTab) => void;
}

export function NetworkPage(props: Readonly<NetworkPageProps>) {
  if (!useCap('settings.manage')) return <Denied />;
  return <NetworkPageInner {...props} />;
}

function NetworkPageInner({ tab, onTab }: Readonly<NetworkPageProps>) {
  const t = useT();
  const confirm = useConfirm();
  const [rulesDirty, setRulesDirty] = useState(false);
  const unsaved = tab === 'rules' && rulesDirty;

  const confirmLeave = () =>
    confirm({
      title: t('network.leaveTitle'),
      message: t('network.leaveMessage'),
      confirmLabel: t('network.discard'),
      cancelLabel: t('network.stay'),
      destructive: true,
    });

  useBlocker({
    shouldBlockFn: async ({ current, next }) => {
      if (!unsaved || next.pathname === current.pathname) return false;
      return !(await confirmLeave());
    },
    enableBeforeUnload: () => unsaved,
  });

  const pick = async (next: string) => {
    if (!isNetworkTab(next) || next === tab) return;
    if (unsaved) {
      if (!(await confirmLeave())) return;
      setRulesDirty(false);
    }
    onTab(next);
  };

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.pageNetwork')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('network.pageSub')}</PageHeader.Subtitle>
      </PageHeader.Root>
      <Box mt={20} mb={20} align="flex-start">
        <SegmentGroup.Root
          value={tab}
          onValueChange={(next) => void pick(next)}
          label={t('admin.pageNetwork')}
        >
          {NETWORK_TABS.map((one) => (
            <SegmentGroup.Item key={one} value={one}>
              <SegmentGroup.Label>{t(LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Box>
      {tab === 'connections' ? <NetworkConnections /> : null}
      {tab === 'destinations' ? <NetworkDestinations /> : null}
      {tab === 'rules' ? <RuleEditor onDirtyChange={setRulesDirty} /> : null}
      {tab === 'listeners' ? <NetworkListeners /> : null}
      {tab === 'settings' ? (
        <SettingsPage
          view="network"
          titleKey="admin.pageNetwork"
          subtitleKey="admin.pageNetworkSub"
          embedded
        />
      ) : null}
    </>
  );
}
