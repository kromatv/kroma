import type { MessageKey } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Menu, Row, Table, type TableColumn, Text } from '@kromatv/ui/kit';
import { useCallerName } from '#web/features/admin/network-callers';
import { flowVolume } from '#web/features/admin/network-format';
import type { DestinationGroup } from '#web/features/admin/network-host-groups';
import type { HostAction } from '#web/features/admin/network-host-rule';
import { RouteBadge } from '#web/features/admin/network-route-badge';

interface DestinationColumn extends TableColumn {
  labelKey: MessageKey | null;
}

const COLUMNS: readonly DestinationColumn[] = [
  { labelKey: 'network.colHost', flex: 2, min: 180 },
  { labelKey: 'network.colCallers', flex: 1.2, from: 'md' },
  { labelKey: 'network.colRoute', flex: 1, min: 96 },
  { labelKey: 'network.colCount', width: 150, align: 'end' },
  { labelKey: 'network.colVolume', flex: 1, from: 'lg', align: 'end' },
  { labelKey: 'network.colLastSeen', flex: 1, from: 'md' },
  { labelKey: null, width: 56, align: 'end' },
];

interface DestinationRowProps {
  group: DestinationGroup;
  callerName: (caller: string) => string;
  onHostAction: (host: string, action: HostAction) => void;
}

function DestinationRow({ group, callerName, onHostAction }: Readonly<DestinationRowProps>) {
  const t = useT();
  const fmt = useFormat();
  return (
    <Table.Row>
      <Table.Cell>
        <Box minW={0}>
          <Text variant="label" lines={1}>
            {group.host}
          </Text>
          <Text variant="meta" color="textDim" lines={1}>
            {group.purposes.join(', ')}
          </Text>
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" lines={2}>
          {group.callers.map(callerName).join(', ')}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Row gap={6} wrap>
          {group.routes.map((route) => (
            <RouteBadge key={route} route={route} />
          ))}
        </Row>
      </Table.Cell>
      <Table.Cell>
        <Box align="flex-end">
          <Text variant="meta" style={TABULAR}>
            {group.count}
          </Text>
          {group.blocked > 0 ? (
            <Text variant="meta" color="danger" style={TABULAR}>
              {t('network.blockedCount', { count: group.blocked })}
            </Text>
          ) : null}
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" style={TABULAR} lines={1}>
          {flowVolume(group, fmt)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim" lines={1}>
          {fmt.elapsed(group.lastAt)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Menu.Root label={t('network.hostActions', { host: group.host })} align="end">
          <Menu.Trigger />
          <Menu.Item icon="shield-lock" onSelect={() => onHostAction(group.host, 'vpn')}>
            {t('network.vpnHost')}
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item icon="ban" tone="danger" onSelect={() => onHostAction(group.host, 'block')}>
            {t('network.blockHost')}
          </Menu.Item>
        </Menu.Root>
      </Table.Cell>
    </Table.Row>
  );
}

interface DestinationTableProps {
  groups: readonly DestinationGroup[];
  onHostAction: (host: string, action: HostAction) => void;
}

export function DestinationTable({ groups, onHostAction }: Readonly<DestinationTableProps>) {
  const t = useT();
  const callerName = useCallerName();
  return (
    <Table.Root label={t('network.tabDestinations')} columns={COLUMNS}>
      <Table.Header>
        <Table.Row>
          {COLUMNS.map((column, index) => (
            <Table.Cell key={column.labelKey ?? index}>
              {column.labelKey ? t(column.labelKey) : null}
            </Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {groups.map((group) => (
          <DestinationRow
            key={group.host}
            group={group}
            callerName={callerName}
            onHostAction={onHostAction}
          />
        ))}
      </Table.Body>
    </Table.Root>
  );
}
