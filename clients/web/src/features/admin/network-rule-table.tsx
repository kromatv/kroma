import type { FlowRoute, Rule, RuleAction } from '@kromatv/client/network';
import type { MessageKey } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { IconButton, Row, Table, type TableColumn, Text } from '@kromatv/ui/kit';
import { RouteBadge } from '#web/features/admin/network-route-badge';

interface RuleColumn extends TableColumn {
  labelKey: MessageKey | null;
}

const COLUMNS: readonly RuleColumn[] = [
  { labelKey: 'network.colOrder', width: 48 },
  { labelKey: 'network.colCaller', flex: 1.3, min: 120 },
  { labelKey: 'network.colPurpose', flex: 0.8, from: 'md' },
  { labelKey: 'network.colHost', flex: 1.4, min: 140 },
  { labelKey: 'network.colAction', width: 104 },
  { labelKey: 'network.colNote', flex: 1.2, from: 'lg' },
  { labelKey: null, width: 168, align: 'end' },
];

const ROAD: Record<RuleAction, FlowRoute> = { direct: 'direct', vpn: 'vpn', block: 'blocked' };

interface RuleRowProps {
  rule: Rule;
  position: number;
  last: boolean;
  callerName: (caller: string) => string;
  onMove: (offset: -1 | 1) => void;
  onEdit: () => void;
  onRemove: () => void;
}

function RuleRow({
  rule,
  position,
  last,
  callerName,
  onMove,
  onEdit,
  onRemove,
}: Readonly<RuleRowProps>) {
  const t = useT();
  const ink = (value: string | null) => (value === null ? 'textDim' : 'text');
  return (
    <Table.Row>
      <Table.Cell>
        <Text variant="meta" color="textDim" style={TABULAR}>
          {position}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="label" color={ink(rule.caller)} lines={2}>
          {rule.caller === null ? t('network.anyCaller') : callerName(rule.caller)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color={ink(rule.purpose)} lines={1}>
          {rule.purpose ?? t('network.anyPurpose')}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color={ink(rule.host)} lines={1}>
          {rule.host ?? t('network.anyHost')}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <RouteBadge route={ROAD[rule.action]} />
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" lines={2}>
          {rule.note ?? ''}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Row gap={2}>
          <IconButton
            variant="ghost"
            control="sm"
            icon="arrow-up"
            label={t('network.ruleUp', { position })}
            disabled={position === 1}
            onPress={() => onMove(-1)}
          />
          <IconButton
            variant="ghost"
            control="sm"
            icon="arrow-down"
            label={t('network.ruleDown', { position })}
            disabled={last}
            onPress={() => onMove(1)}
          />
          <IconButton
            variant="ghost"
            control="sm"
            icon="pencil"
            label={t('network.ruleEdit', { position })}
            onPress={onEdit}
          />
          <IconButton
            variant="ghost"
            control="sm"
            icon="trash"
            label={t('network.ruleRemove', { position })}
            onPress={onRemove}
          />
        </Row>
      </Table.Cell>
    </Table.Row>
  );
}

interface RuleTableProps {
  rules: readonly Rule[];
  callerName: (caller: string) => string;
  onMove: (index: number, offset: -1 | 1) => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

export function RuleTable({
  rules,
  callerName,
  onMove,
  onEdit,
  onRemove,
}: Readonly<RuleTableProps>) {
  const t = useT();
  return (
    <Table.Root label={t('network.tabRules')} columns={COLUMNS}>
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
        {rules.map((rule, index) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            position={index + 1}
            last={index === rules.length - 1}
            callerName={callerName}
            onMove={(offset) => onMove(index, offset)}
            onEdit={() => onEdit(index)}
            onRemove={() => onRemove(index)}
          />
        ))}
      </Table.Body>
    </Table.Root>
  );
}
