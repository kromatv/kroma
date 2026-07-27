// Shared page header: back chevron, centered title, optional right slot.
// The surrounding <Screen> already pads the top safe area (Dynamic Island /
// status bar), so the header adds only its own breathing room.

import { BackButton } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { spacing, type } from '#mobile/lib/theme';

export function PageHeader({ title, right }: Readonly<{ title: string; right?: ReactNode }>) {
  const t = useT();
  const router = useRouter();
  return (
    <View style={[styles.header, { paddingTop: 6 }]}>
      <BackButton
        variant="ghost"
        size={40}
        hitSlop={12}
        label={t('common.back')}
        onPress={() => goBack(router)}
      />
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  side: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.heading, flex: 1, textAlign: 'center' },
});
