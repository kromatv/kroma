import type { InboundRow } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Table, type TableColumn, Text } from '@kromatv/ui/kit';
import { flowVolume } from '#web/features/admin/network-format';
import { ViaBadge } from '#web/features/admin/network-via-badge';
import { type DeviceKind, deviceInfo } from '#web/shared/lib/device';

interface InboundColumn extends TableColumn {
  labelKey: MessageKey;
}

const COLUMNS: readonly InboundColumn[] = [
  { labelKey: 'network.colClient', flex: 1.8, min: 180 },
  { labelKey: 'network.colAddress', flex: 1.2, min: 130 },
  { labelKey: 'network.colRoute', width: 120 },
  { labelKey: 'network.colRequests', width: 110, align: 'end' },
  { labelKey: 'network.colVolume', flex: 1, from: 'lg', align: 'end' },
  { labelKey: 'network.colLastSeen', flex: 1, from: 'md' },
];

const KIND_LABEL: Record<DeviceKind, MessageKey> = {
  tv: 'network.clientTv',
  mobile: 'network.clientMobile',
  desktop: 'network.clientDesktop',
};

function InboundTableRow({ row }: Readonly<{ row: InboundRow }>) {
  const t = useT();
  const fmt = useFormat();
  const device = deviceInfo(row.userAgent, t('network.clientUnknown'));
  return (
    <Table.Row>
      <Table.Cell>
        <Box minW={0}>
          <Text variant="label" lines={1}>
            {device.label}
          </Text>
          <Text variant="meta" color="textDim" lines={1}>
            {t(KIND_LABEL[device.kind])}
          </Text>
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" style={TABULAR} lines={1}>
          {row.address}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <ViaBadge via={row.via} />
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" style={TABULAR}>
          {row.count}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" style={TABULAR} lines={1}>
          {flowVolume(row, fmt)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim" lines={1}>
          {fmt.elapsed(row.lastAt)}
        </Text>
      </Table.Cell>
    </Table.Row>
  );
}

/** One row per client: what it is, where it came from and how, and how much it asked for. */
export function InboundTable({ rows }: Readonly<{ rows: readonly InboundRow[] }>) {
  const t = useT();
  return (
    <Table.Root label={t('network.tabInbound')} columns={COLUMNS}>
      <Table.Header>
        <Table.Row>
          {COLUMNS.map((column) => (
            <Table.Cell key={column.labelKey}>{t(column.labelKey)}</Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <InboundTableRow key={`${row.address}|${row.via}|${row.userAgent}`} row={row} />
        ))}
      </Table.Body>
    </Table.Root>
  );
}
