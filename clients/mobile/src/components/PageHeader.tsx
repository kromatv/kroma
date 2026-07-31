// Shared page header: back chevron, centered title, optional right slot.
// The surrounding <Screen> already pads the top safe area (Dynamic Island /
// status bar), so the header adds only its own breathing room.

import { BackButton, styles } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { spacing, type } from '#mobile/lib/theme';

export function PageHeader({ title, right }: Readonly<{ title: string; right?: ReactNode }>) {
  const t = useT();
  const router = useRouter();
  return (
    <View style={[s.header, { paddingTop: 6 }]}>
      <BackButton
        variant="ghost"
        size={40}
        hitSlop={12}
        label={t('common.back')}
        onPress={() => goBack(router)}
      />
      <Text numberOfLines={1} style={s.title}>
        {title}
      </Text>
      <View style={s.side}>{right}</View>
    </View>
  );
}

const s = styles({
  header: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.sm,
    px: spacing.md,
    pb: spacing.sm,
  },
  side: { center: true, w: 40, h: 40 },
  title: { ...type.heading, flex: true, textAlign: 'center' },
});
