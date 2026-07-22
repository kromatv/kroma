// App settings: interface language (dedicated page), server identity, version.

import { LOCALES } from '@kroma/core';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '../../../components/PageHeader';
import { Screen } from '../../../components/ui';
import { useI18n, useT } from '../../../lib/i18n';
import { boxed, contentWidth } from '../../../lib/layout';
import { useSession } from '../../../lib/session';
import { colors, radius, spacing, type } from '../../../lib/theme';
import { ChevronRightIcon } from '../../../player/icons';

export default function Settings() {
  const t = useT();
  const router = useRouter();
  const { serverUrl } = useSession();
  const { locale } = useI18n();
  const localeLabel = LOCALES.find((l) => l.code === locale)?.labelKey;
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen padded={false}>
      <PageHeader title={t('nav.settings')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Pressable
            onPress={() => router.push('/settings/language' as never)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={styles.rowLabel}>{t('account.uiLanguage')}</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{localeLabel ? t(localeLabel) : locale}</Text>
              <ChevronRightIcon size={16} color={colors.textFaint} />
            </View>
          </Pressable>
        </View>

        <Text style={styles.group}>{t('nav.server')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('nav.server')}</Text>
            <Text numberOfLines={1} style={styles.rowValue}>
              {serverUrl?.replace(/^https?:\/\//, '')}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('nav.versionClient')}</Text>
            <Text style={styles.rowValue}>{version}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, gap: spacing.sm, ...boxed(contentWidth.reading) },
  group: {
    ...type.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowLabel: { ...type.body, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  rowValue: { ...type.caption, flexShrink: 1 },
});
