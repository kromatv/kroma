import type { Listener, ListenerExposure } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Badge, EmptyState, Table, type TableColumn, Text } from '@kromatv/ui/kit';
import { usePoll } from '#web/features/admin/hooks';
import { useCallerName } from '#web/features/admin/network-callers';
import { destination } from '#web/features/admin/network-format';
import { NetworkLoadFailed } from '#web/features/admin/network-load-failed';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const LISTENERS_POLL_MS = 15000;

interface ListenerColumn extends TableColumn {
  labelKey: MessageKey;
}

const COLUMNS: readonly ListenerColumn[] = [
  { labelKey: 'network.colOwner', flex: 1.2, min: 120 },
  { labelKey: 'network.colPurpose', flex: 1, from: 'md' },
  { labelKey: 'network.colAddress', flex: 1.4, min: 140 },
  { labelKey: 'network.colProtocol', width: 112 },
  { labelKey: 'network.colExposure', width: 112 },
];

const EXPOSURE: Record<ListenerExposure, { tone: 'warning' | 'neutral'; labelKey: MessageKey }> = {
  network: { tone: 'warning', labelKey: 'network.exposureNetwork' },
  loopback: { tone: 'neutral', labelKey: 'network.exposureLoopback' },
};

function listenerKey(listener: Listener): string {
  return `${listener.protocol}:${destination(listener.address, listener.port)}`;
}

export function NetworkListeners() {
  const t = useT();
  const { client } = useAuth();
  const callerName = useCallerName();
  const { data, failed, error } = usePoll(
    ['admin', 'network', 'listeners'],
    () => client.network.listeners(),
    LISTENERS_POLL_MS,
  );

  if (failed && data === null) return <NetworkLoadFailed error={error} />;
  if (data === null) return <TableSkeleton rows={4} />;
  if (data.listeners.length === 0) {
    return (
      <EmptyState.Root icon="plug">
        <EmptyState.Title>{t('network.listenersEmpty')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  return (
    <Table.Root label={t('network.tabListeners')} columns={COLUMNS}>
      <Table.Header>
        <Table.Row>
          {COLUMNS.map((column) => (
            <Table.Cell key={column.labelKey}>{t(column.labelKey)}</Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {data.listeners.map((listener) => {
          const exposure = EXPOSURE[listener.exposure];
          return (
            <Table.Row key={listenerKey(listener)}>
              <Table.Cell>
                <Text variant="label" lines={1}>
                  {callerName(listener.owner)}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text variant="meta" color="textMuted" lines={1}>
                  {listener.purpose}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text variant="meta" style={TABULAR} lines={1}>
                  {destination(listener.address, listener.port)}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text variant="meta" color="textMuted">
                  {listener.protocol.toUpperCase()}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Badge tone={exposure.tone}>{t(exposure.labelKey)}</Badge>
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table.Root>
  );
}
