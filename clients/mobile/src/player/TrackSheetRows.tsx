import { Box, Icon, type IconName, SwitchFace, styles, Text } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { colors, spacing, type } from '#mobile/lib/theme';

export function Row({
  label,
  selected,
  disabled,
  note,
  onPress,
}: Readonly<{
  label: string;
  selected: boolean;
  disabled?: boolean;
  note?: string;
  onPress(): void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.row,
        selected && s.rowOn,
        pressed && { backgroundColor: colors.surfaceHigh },
        disabled && s.rowDisabled,
      ]}
    >
      <Text style={[s.rowLabel, selected && s.rowLabelOn]}>{label}</Text>
      {note ? <Text style={s.rowNote}>{note}</Text> : null}
      {selected ? <Icon name="check" size={17} thickness={2.4} color={colors.accent} /> : null}
    </Pressable>
  );
}

export function MenuRow({
  icon,
  label,
  value,
  toggle,
  on,
  onPress,
}: Readonly<{
  icon: IconName;
  label: string;
  value?: string;
  toggle?: boolean;
  on?: boolean;
  onPress(): void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={toggle ? { checked: Boolean(on) } : undefined}
      style={({ pressed }) => [s.menuRow, pressed && { backgroundColor: colors.surfaceHigh }]}
    >
      <Icon name={icon} size={20} thickness={1.8} color={colors.textDim} />
      <Box style={s.menuText}>
        <Text style={s.menuLabel}>{label}</Text>
        {!toggle && value ? (
          <Text lines={1} style={s.menuValue}>
            {value}
          </Text>
        ) : null}
      </Box>
      {toggle ? (
        <SwitchFace checked={Boolean(on)} style={s.noShrink} />
      ) : (
        <Icon name="chevron-right" size={18} thickness={2.2} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

export function SubHeader({ title, onBack }: Readonly<{ title: string; onBack(): void }>) {
  return (
    <Pressable onPress={onBack} style={({ pressed }) => [s.subHeader, pressed && { opacity: 0.7 }]}>
      <Icon name="chevron-left" size={20} thickness={2.4} color={colors.text} />
      <Text style={s.subTitle}>{title}</Text>
    </Pressable>
  );
}

export function ChipGroup({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Box style={s.chipGroup}>
      <Text style={s.group}>{label}</Text>
      <Box style={s.chipRow}>{children}</Box>
    </Box>
  );
}

const s = styles({
  menuRow: { row: true, align: 'center', gap: 14, minH: 54, px: spacing.md, py: 8, radius: 14 },
  menuText: { flex: true, minW: 0 },
  menuLabel: { ...type.body, color: 'text', fontWeight: '700' },
  menuValue: { ...type.small, mt: 1 },
  noShrink: { shrink: 0 },
  subHeader: { row: true, align: 'center', gap: 8, px: spacing.sm, py: 10, mb: spacing.xs },
  subTitle: { ...type.section, color: 'text' },
  group: {
    ...type.small,
    mb: spacing.xs,
    color: 'accent',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chipGroup: { px: spacing.sm, mb: spacing.md },
  chipRow: { row: true, wrap: true, align: 'center', gap: 8 },
  row: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.sm,
    minH: 48,
    px: spacing.md,
    radius: 14,
  },
  rowOn: { bg: 'white/10' },
  rowDisabled: { opacity: 0.45 },
  rowLabel: { ...type.body, shrink: 1, color: 'textMuted' },
  rowLabelOn: { color: 'text', fontWeight: '600' },
  rowNote: { ...type.small, color: 'textDim' },
});
