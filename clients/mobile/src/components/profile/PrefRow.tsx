import { Box, Icon, type IconName, styles, Text } from '@kroma/ui/kit';
import { Pressable } from 'react-native';
import { radius, spacing, type } from '#mobile/lib/theme';

export function PrefRow({
  icon,
  label,
  value,
  onPress,
}: Readonly<{ icon: IconName; label: string; value: string; onPress(): void }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
    >
      <Box style={s.rowIconLabel}>
        <Box style={s.rowIconBox}>
          <Icon name={icon} size={19} thickness={1.8} color="accentText" />
        </Box>
        {/* The label yields to an ellipsis, the value never does. */}
        <Text lines={1} style={s.rowLabel}>
          {label}
        </Text>
      </Box>
      <Box style={s.rowRight}>
        <Text lines={1} style={s.rowValue}>
          {value}
        </Text>
        <Icon name="selector" size={16} thickness={2} color="textDim" />
      </Box>
    </Pressable>
  );
}

const s = styles({
  row: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.md,
    minH: 54,
    px: spacing.sm,
    radius: radius.md,
  },
  rowPressed: { bg: 'surface2' },
  rowIconLabel: { flex: true, row: true, align: 'center', gap: 12 },
  rowIconBox: { center: true, w: 34, h: 34, bg: 'accentSoft', radius: 10 },
  rowLabel: { ...type.body, shrink: 1, fontWeight: '500' },
  rowRight: { row: true, align: 'center', shrink: 0, gap: 8 },
  rowValue: { ...type.caption },
});
