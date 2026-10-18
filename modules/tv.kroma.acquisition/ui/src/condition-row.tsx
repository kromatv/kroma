import { useT } from '@kromatv/module-sdk';
import { Box, Icon, IconButton, Row, SegmentGroup, Select, Surface } from '@kromatv/ui/kit';
import type { Ref } from 'react';
import type { View } from 'react-native';
import { retypeCondition } from './condition-draft';
import { Labelled } from './condition-fields';
import {
  CONDITION_MODES,
  type ConditionMode,
  MODE_LABEL,
  modeOf,
  withMode,
} from './condition-mode';
import { ConditionValue } from './condition-value';
import { CONDITION_TYPES, type Condition, type ConditionType } from './rules-schemas';

const TYPE_W = 190;
const MODE_W = 280;

export function ConditionRow({
  condition,
  removeRef,
  onChange,
  onRemove,
}: Readonly<{
  condition: Condition;
  removeRef?: Ref<View>;
  onChange: (next: Condition) => void;
  onRemove: () => void;
}>) {
  const t = useT();
  const mode = modeOf(condition);
  return (
    <Surface radius="lg" pad="sm" tone="outline">
      <Row wrap gap={10} align="flex-end">
        <Box w={MODE_W}>
          <Labelled label={t('acq.conditionWeight')}>
            <SegmentGroup.Root
              value={mode}
              onValueChange={(next: ConditionMode) => onChange(withMode(condition, next))}
              label={t('acq.conditionWeight')}
              size="sm"
              stretch
            >
              {CONDITION_MODES.map((one) => (
                <SegmentGroup.Item key={one} value={one}>
                  <SegmentGroup.Label>{t(MODE_LABEL[one])}</SegmentGroup.Label>
                </SegmentGroup.Item>
              ))}
            </SegmentGroup.Root>
          </Labelled>
        </Box>
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
        <IconButton
          ref={removeRef}
          control="sm"
          radius="sm"
          variant="ghost"
          label={t('acq.conditionRemoveOf', { name: t(`acq.condition.${condition.type}`) })}
          onPress={onRemove}
        >
          <Icon name="trash" size={16} color="dangerHover" thickness={2.2} />
        </IconButton>
      </Row>
    </Surface>
  );
}

function typeOf(picked: string): ConditionType {
  return CONDITION_TYPES.find((type) => type === picked) ?? 'releaseTitle';
}
