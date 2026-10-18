import { MinAvailability, MonitorPreset } from '@kromatv/client/monitoring';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Select, Switch, Text } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

export function usePresetLabel(): (preset: MonitorPreset) => string {
  const t = useT();
  return (preset) => t(`monitoring.preset.${preset}` as MessageKey);
}

export function SettingRow({
  label,
  hint,
  block = false,
  children,
}: Readonly<{ label: string; hint?: string; block?: boolean; children: ReactNode }>) {
  return (
    <Box
      row={{ base: !block, md: true }}
      justify="space-between"
      align={{ base: block ? 'stretch' : 'center', md: 'center' }}
      gap={{ base: block ? 10 : 16, md: 20 }}
      wrap
      px={{ base: 16, md: 22 }}
      py={16}
    >
      <Box shrink={1} minW={{ base: 0, md: 160 }} gap={2}>
        <Text variant="label">{label}</Text>
        {hint ? (
          <Text variant="meta" color="textDim">
            {hint}
          </Text>
        ) : null}
      </Box>
      <Box
        shrink={0}
        w={block ? { base: '100%', md: 340 } : undefined}
        align={block ? { base: 'stretch', md: 'flex-end' } : 'flex-end'}
      >
        {children}
      </Box>
    </Box>
  );
}

export function PresetSelect({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: MonitorPreset | null;
  onChange: (next: MonitorPreset) => void;
  disabled?: boolean;
}>) {
  const t = useT();
  const label = usePresetLabel();
  return (
    <Select.Root
      label={t('monitoring.preset')}
      placeholder={t('monitoring.presetCustom')}
      value={value ?? ''}
      onValueChange={(next) => onChange(MonitorPreset.parse(next))}
      disabled={disabled}
    >
      <Select.Trigger block />
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
      <Select.Trigger block />
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

export function SpecialsSwitch({
  checked,
  onChange,
  hint,
  disabled,
}: Readonly<{
  checked: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
  disabled?: boolean;
}>) {
  const t = useT();
  return (
    <SettingRow label={t('monitoring.specials')} hint={hint}>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        label={t('monitoring.specials')}
        disabled={disabled}
      />
    </SettingRow>
  );
}
