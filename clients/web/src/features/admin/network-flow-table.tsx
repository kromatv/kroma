import type { Flow, Rule } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useFormat, useLocale, useT } from '@kromatv/ui';
import { Box, Table, type TableColumn, Text } from '@kromatv/ui/kit';
import { useMemo } from 'react';
import { useCallerName } from '#web/features/admin/network-callers';
import { destination, flowDuration, flowVolume } from '#web/features/admin/network-format';
import { RouteBadge } from '#web/features/admin/network-route-badge';

interface FlowColumn extends TableColumn {
  labelKey: MessageKey;
}

const COLUMNS: readonly FlowColumn[] = [
  { labelKey: 'network.colTime', width: 88 },
  { labelKey: 'network.colCaller', flex: 1.2, min: 120 },
  { labelKey: 'network.colPurpose', flex: 0.8, from: 'md' },
  { labelKey: 'network.colDestination', flex: 1.8, min: 160 },
  { labelKey: 'network.colRoute', width: 92 },
  { labelKey: 'network.colStatus', width: 72, from: 'md' },
  { labelKey: 'network.colVolume', flex: 1, from: 'lg', align: 'end' },
  { labelKey: 'network.colDuration', width: 88, from: 'md', align: 'end' },
  { labelKey: 'network.colRule', flex: 1, from: 'lg' },
];

const ABSENT = '-';

interface RuleRef {
  position: number;
  rule: Rule;
}

function DestinationCell({ flow }: Readonly<{ flow: Flow }>) {
  return (
    <Box minW={0}>
      <Text variant="meta" lines={1}>
        {destination(flow.host, flow.port)}
      </Text>
      <Text variant="meta" color={flow.error ? 'danger' : 'textDim'} lines={1}>
        {flow.error ?? flow.method}
      </Text>
    </Box>
  );
}

function RuleCell({
  id,
  rules,
}: Readonly<{ id: string | null; rules: ReadonlyMap<string, RuleRef> }>) {
  const t = useT();
  if (id === null) {
    return (
      <Text variant="meta" color="textDim" lines={1}>
        {t('network.ruleDefault')}
      </Text>
    );
  }
  const ref = rules.get(id);
  const detail = ref ? (ref.rule.note ?? ref.rule.host) : null;
  return (
    <Box minW={0}>
      <Text variant="meta" lines={1}>
        {ref ? t('network.ruleNumber', { position: ref.position }) : id}
      </Text>
      {detail ? (
        <Text variant="meta" color="textDim" lines={1}>
          {detail}
        </Text>
      ) : null}
    </Box>
  );
}

interface FlowRowProps {
  flow: Flow;
  clock: Intl.DateTimeFormat;
  rules: ReadonlyMap<string, RuleRef>;
  callerName: (caller: string) => string;
}

function FlowRow({ flow, clock, rules, callerName }: Readonly<FlowRowProps>) {
  const fmt = useFormat();
  return (
    <Table.Row>
      <Table.Cell>
        <Text variant="meta" color="textDim" style={TABULAR}>
          {clock.format(flow.at)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="label" lines={2}>
          {callerName(flow.caller)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" lines={1}>
          {flow.purpose}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <DestinationCell flow={flow} />
      </Table.Cell>
      <Table.Cell>
        <RouteBadge route={flow.route} />
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" style={TABULAR}>
          {flow.status ?? ABSENT}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" style={TABULAR} lines={1}>
          {flowVolume(flow, fmt)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" style={TABULAR}>
          {flowDuration(flow.durationMs, fmt)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <RuleCell id={flow.rule} rules={rules} />
      </Table.Cell>
    </Table.Row>
  );
}

interface FlowTableProps {
  flows: readonly Flow[];
  rules: readonly Rule[];
}

export function FlowTable({ flows, rules }: Readonly<FlowTableProps>) {
  const t = useT();
  const locale = useLocale();
  const callerName = useCallerName();
  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [locale],
  );
  const byId = useMemo(
    () => new Map(rules.map((rule, index) => [rule.id, { position: index + 1, rule }])),
    [rules],
  );
  return (
    <Table.Root label={t('network.tabConnections')} columns={COLUMNS}>
      <Table.Header>
        <Table.Row>
          {COLUMNS.map((column) => (
            <Table.Cell key={column.labelKey}>{t(column.labelKey)}</Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {flows.map((flow) => (
          <FlowRow key={flow.id} flow={flow} clock={clock} rules={byId} callerName={callerName} />
        ))}
      </Table.Body>
    </Table.Root>
  );
}
