import { Box, Icon, styles, Text } from '@kroma/ui/kit';
import { Pressable } from 'react-native';
import { spacing, type } from '#mobile/lib/theme';

export function RemoteHeader({ title, onBack }: Readonly<{ title: string; onBack(): void }>) {
  return (
    <Box style={s.header}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
        <Icon name="chevron-down" size={26} thickness={2} />
      </Pressable>
      <Text lines={1} style={s.headerTitle}>
        {title}
      </Text>
      <Box style={s.headerSpacer} />
    </Box>
  );
}

const s = styles({
  header: { row: true, align: 'center', gap: spacing.sm, py: spacing.sm },
  headerTitle: { ...type.heading, flex: true, color: 'text' },
  headerSpacer: { w: 26 },
});
