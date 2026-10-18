import { useT } from '@kromatv/module-sdk';
import { Box, Row, Select } from '@kromatv/ui/kit';
import { Entry, Labelled } from './condition-fields';
import { isLanguagePreset, LANGUAGE_PRESETS } from './language-presets';
import { NOT_LISTED } from './not-listed';

export function ConditionLanguage({
  label,
  value,
  onPick,
}: Readonly<{ label: string; value: string; onPick: (next: string) => void }>) {
  const t = useT();
  const listed = isLanguagePreset(value);
  return (
    <Row wrap gap={10} align="flex-end">
      <Box w={230}>
        <Labelled label={label}>
          <Select.Root
            label={label}
            value={listed ? value : NOT_LISTED}
            onValueChange={(next) => onPick(next === NOT_LISTED ? '' : next)}
          >
            <Select.Trigger size="sm" block />
            {LANGUAGE_PRESETS.map((preset) => (
              <Select.Item key={preset.value} value={preset.value} label={t(preset.labelKey)} />
            ))}
            <Select.Item value={NOT_LISTED} label={t('acq.langOther')} />
          </Select.Root>
        </Labelled>
      </Box>
      {listed ? null : (
        <Box w={150}>
          <Entry label={t('acq.conditionTag')} placeholder="pt-BR" value={value} onPick={onPick} />
        </Box>
      )}
    </Row>
  );
}
