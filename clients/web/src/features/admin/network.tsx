import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, SegmentGroup } from '@kromatv/ui/kit';
import { NetworkConnections } from '#web/features/admin/network-connections';
import { NetworkDestinations } from '#web/features/admin/network-destinations';
import { NetworkListeners } from '#web/features/admin/network-listeners';
import { SettingsPage } from '#web/features/admin/settings';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';

export const NETWORK_TABS = ['connections', 'destinations', 'listeners', 'settings'] as const;
type NetworkTab = (typeof NETWORK_TABS)[number];

const LABEL: Record<NetworkTab, MessageKey> = {
  connections: 'network.tabConnections',
  destinations: 'network.tabDestinations',
  listeners: 'network.tabListeners',
  settings: 'network.tabSettings',
};

function isNetworkTab(value: string): value is NetworkTab {
  return NETWORK_TABS.some((tab) => tab === value);
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

  const pick = (next: string) => {
    if (isNetworkTab(next) && next !== tab) onTab(next);
  };

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.pageNetwork')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('network.pageSub')}</PageHeader.Subtitle>
      </PageHeader.Root>
      <Box mt={20} mb={20} align="flex-start">
        <SegmentGroup.Root value={tab} onValueChange={pick} label={t('admin.pageNetwork')}>
          {NETWORK_TABS.map((one) => (
            <SegmentGroup.Item key={one} value={one}>
              <SegmentGroup.Label>{t(LABEL[one])}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
      </Box>
      {tab === 'connections' ? <NetworkConnections /> : null}
      {tab === 'destinations' ? <NetworkDestinations /> : null}
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
