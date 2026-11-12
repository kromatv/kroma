import { useT } from '@kromatv/ui';
import { Button, Menu } from '@kromatv/ui/kit';
import { RULE_PRESETS, type RulePreset } from '#web/features/admin/network-presets';

export function PresetMenu({ onPick }: Readonly<{ onPick: (preset: RulePreset) => void }>) {
  const t = useT();
  return (
    <Menu.Root label={t('network.presets')} align="end">
      <Menu.Trigger
        render={(bind) => (
          <Button
            ref={bind.ref}
            variant="outline"
            icon="wand"
            label={t('network.presets')}
            onPress={bind.onPress}
          />
        )}
      />
      {RULE_PRESETS.map((one) => (
        <Menu.Item key={one.preset} onSelect={() => onPick(one.preset)}>
          {t(one.labelKey)}
        </Menu.Item>
      ))}
    </Menu.Root>
  );
}
