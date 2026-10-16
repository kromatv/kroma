import { useT } from '@kromatv/module-sdk';
import { Box, Icon, IconButton, Row, Select, Switch, Text } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import { retypeCondition } from './condition-draft';
import { ConditionValue } from './condition-value';
import { CONDITION_TYPES, type Condition, type ConditionType } from './rules-schemas';

const TYPE_W = 180;

export function ConditionRow({
  condition,
  labelled,
  onChange,
  onRemove,
}: Readonly<{
  condition: Condition;
  labelled: boolean;
  onChange: (next: Condition) => void;
  onRemove: () => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} align="flex-end">
      <Box w={TYPE_W}>
        <Labelled label={t('acq.conditionType')} labelled={labelled}>
          <Select.Root
            label={t('acq.conditionType')}
            value={condition.type}
            onValueChange={(next) => onChange(retypeCondition(condition, typeOf(next)))}
          >
            <Select.Trigger size="sm" block />
            {CONDITION_TYPES.map((type) => (
              <Select.Item key={type} value={type} label={t(`acq.condition.${type}`)} />
            ))}
          </Select.Root>
        </Labelled>
      </Box>

      <ConditionValue condition={condition} labelled={labelled} onChange={onChange} />

      <Flag
        label={t('acq.conditionRequired')}
        labelled={labelled}
        on={condition.required}
        onChange={(required) => onChange({ ...condition, required })}
      />
      <Flag
        label={t('acq.conditionNegate')}
        labelled={labelled}
        on={condition.negate}
        onChange={(negate) => onChange({ ...condition, negate })}
      />

      <IconButton
        control="sm"
        radius="sm"
        variant="ghost"
        label={t('acq.conditionRemove')}
        onPress={onRemove}
      >
        <Icon name="trash" size={16} color="dangerHover" thickness={2.2} />
      </IconButton>
    </Row>
  );
}

function typeOf(picked: string): ConditionType {
  return CONDITION_TYPES.find((type) => type === picked) ?? 'releaseTitle';
}

function Labelled({
  label,
  labelled,
  children,
}: Readonly<{ label: string; labelled: boolean; children: ReactNode }>) {
  return (
    <Box gap={6}>
      {labelled ? (
        <Text variant="meta" color="textMuted">
          {label}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

function Flag({
  label,
  labelled,
  on,
  onChange,
}: Readonly<{
  label: string;
  labelled: boolean;
  on: boolean;
  onChange: (next: boolean) => void;
}>) {
  return (
    <Labelled label={label} labelled={labelled}>
      <Box py={6}>
        <Switch label={label} checked={on} onCheckedChange={onChange} />
      </Box>
    </Labelled>
  );
}
