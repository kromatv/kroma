import { useT } from '@kromatv/module-sdk';
import { Box, Checkbox, Icon, IconButton, Row, Select, Surface, Text } from '@kromatv/ui/kit';
import { retypeCondition } from './condition-draft';
import { Labelled } from './condition-fields';
import { ConditionValue } from './condition-value';
import { CONDITION_TYPES, type Condition, type ConditionType } from './rules-schemas';

const TYPE_W = 190;

export function ConditionRow({
  condition,
  onChange,
  onRemove,
}: Readonly<{
  condition: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
}>) {
  const t = useT();
  return (
    <Surface radius="lg" pad="sm" tone="raised">
      <Box gap={12}>
        <Row wrap between gap={10} align="flex-end">
          <Row wrap gap={10} align="flex-end" flex minW={0}>
            <Box w={TYPE_W}>
              <Labelled label={t('acq.conditionType')}>
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
            <ConditionValue condition={condition} onChange={onChange} />
          </Row>

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

        <Row wrap gapX={20} gapY={8} align="center">
          <Flag
            label={t('acq.conditionRequired')}
            hint={t('acq.conditionRequiredHint')}
            on={condition.required}
            onChange={(required) => onChange({ ...condition, required })}
          />
          <Flag
            label={t('acq.conditionNegate')}
            hint={t('acq.conditionNegateHint')}
            on={condition.negate}
            onChange={(negate) => onChange({ ...condition, negate })}
          />
        </Row>
      </Box>
    </Surface>
  );
}

function typeOf(picked: string): ConditionType {
  return CONDITION_TYPES.find((type) => type === picked) ?? 'releaseTitle';
}

function Flag({
  label,
  hint,
  on,
  onChange,
}: Readonly<{
  label: string;
  hint: string;
  on: boolean;
  onChange: (next: boolean) => void;
}>) {
  return (
    <Row gap={8} align="center">
      <Checkbox label={label} checked={on} onCheckedChange={onChange} />
      <Box minW={0}>
        <Text variant="meta" color={on ? 'text' : 'textMuted'}>
          {label}
        </Text>
        <Text variant="meta" color="textDim" lines={1}>
          {hint}
        </Text>
      </Box>
    </Row>
  );
}
