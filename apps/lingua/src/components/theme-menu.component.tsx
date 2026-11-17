import type { ThemeMode } from '@kromatv/ui/kit';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Icon, type IconName } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Menu } from '@kromatv/ui/kit/organisms/menu';
import { useThemeMode } from '#site/lib/use-theme-mode.hook';

const MODES: readonly { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: 'system', label: 'System', icon: 'device-desktop' },
  { mode: 'light', label: 'Light', icon: 'sun' },
  { mode: 'dark', label: 'Dark', icon: 'moon' },
];

function Choice({
  label,
  icon,
  current,
}: Readonly<{ label: string; icon: IconName; current: boolean }>) {
  return (
    <Row gap={10} align="center" px={4} py={2} minW={150}>
      <Icon name={icon} size={16} color={current ? 'accentText' : 'textMuted'} />
      <Text variant="meta" color={current ? 'accentText' : 'text'}>
        {label}
      </Text>
      <Box flex />
      {current ? <Icon name="check" size={15} color="accentText" /> : null}
    </Row>
  );
}

/** The theme, from the header: one button showing the mode in force, opening the three to choose from. */
export function ThemeMenu() {
  const { mode, choose } = useThemeMode();
  const current = MODES.find((entry) => entry.mode === mode) ?? MODES[0];
  return (
    <Menu.Root label={`Theme: ${current?.label ?? 'System'}`} align="end">
      <Menu.Trigger icon={current?.icon ?? 'device-desktop'} diameter={40} />
      {MODES.map((entry) => (
        <Menu.Item
          key={entry.mode}
          label={`${entry.label} theme`}
          onSelect={() => choose(entry.mode)}
        >
          <Choice label={entry.label} icon={entry.icon} current={entry.mode === mode} />
        </Menu.Item>
      ))}
    </Menu.Root>
  );
}
