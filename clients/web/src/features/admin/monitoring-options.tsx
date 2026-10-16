import { MinAvailability, MonitorPreset } from '@kromatv/client/monitoring';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Row, Select, Text } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

export function usePresetLabel(): (preset: MonitorPreset) => string {
  const t = useT();
  return (preset) => t(`monitoring.preset.${preset}` as MessageKey);
}

export function OptionRow({
  label,
  hint,
  children,
}: Readonly<{ label: string; hint?: string; children: ReactNode }>) {
  return (
    <Row between gap={20} align="center" wrap>
      <Box shrink={1} minW={160}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="meta" color="textDim" mt={2}>
            {hint}
          </Text>
        ) : null}
      </Box>
      <Box minW={200}>{children}</Box>
    </Row>
  );
}

export function PresetSelect({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: MonitorPreset;
  onChange: (next: MonitorPreset) => void;
  disabled?: boolean;
}>) {
  const t = useT();
  const label = usePresetLabel();
  return (
    <Select.Root
      label={t('monitoring.preset')}
      value={value}
      onValueChange={(next) => onChange(MonitorPreset.parse(next))}
      disabled={disabled}
    >
      <Select.Trigger />
      {MonitorPreset.options.map((preset) => (
        <Select.Item key={preset} value={preset} label={label(preset)} />
      ))}
    </Select.Root>
  );
}

export function AvailabilitySelect({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: MinAvailability;
  onChange: (next: MinAvailability) => void;
  disabled?: boolean;
}>) {
  const t = useT();
  return (
    <Select.Root
      label={t('monitoring.minAvailability')}
      value={value}
      onValueChange={(next) => onChange(MinAvailability.parse(next))}
      disabled={disabled}
    >
      <Select.Trigger />
      {MinAvailability.options.map((option) => (
        <Select.Item
          key={option}
          value={option}
          label={t(`monitoring.avail.${option}` as MessageKey)}
        />
      ))}
    </Select.Root>
  );
}
