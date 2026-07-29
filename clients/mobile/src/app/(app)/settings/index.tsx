// App settings: interface language (dedicated page), server identity, and what
// build of the app this actually is.

import { formatBuildDate, LOCALES } from '@kroma/core';
import { Icon, type IconName } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { buildInfo, commitLabel, repoLabel } from '#mobile/lib/buildInfo';
import { useI18n, useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

export default function Settings() {
  const t = useT();
  const router = useRouter();
  const { serverUrl } = useSession();
  const client = useClient();
  const { locale } = useI18n();
  const localeLabel = LOCALES.find((l) => l.code === locale)?.labelKey;
  // The server names its own version on the public health endpoint, the same
  // place the web client's sidebar reads it from.
  const health = useQuery({ queryKey: ['health', serverUrl], queryFn: () => client.health() });
  const { repository } = buildInfo;

  return (
    <Screen padded={false}>
      <PageHeader title={t('nav.settings')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Row
            label={t('account.uiLanguage')}
            value={localeLabel ? t(localeLabel) : locale}
            icon="chevron-right"
            onPress={() => router.push('/settings/language' as never)}
          />
          <Row
            label={t('notifications.settings')}
            value={t('notifications.title')}
            icon="chevron-right"
            onPress={() => router.push('/settings/notifications' as never)}
          />
        </View>

        <Text style={styles.group}>{t('nav.server')}</Text>
        <View style={styles.card}>
          <Row label={t('nav.server')} value={serverUrl?.replace(/^https?:\/\//, '')} />
          {/* Plain "Version" in both cards: which side it belongs to is what the
              group heading above it already says. */}
          <Row label={t('about.version')} value={health.data ? `v${health.data.version}` : '…'} />
        </View>

        <Text style={styles.group}>{t('about.title')}</Text>
        <View style={styles.card}>
          <Row label={t('about.version')} value={`v${buildInfo.version}`} />
          {/* Everything git-derived is absent in a build made outside a checkout
              (a source tarball), so each of these rows is its own value's guard. */}
          <Row label={t('about.commit')} value={commitLabel()} mono />
          <Row label={t('about.branch')} value={buildInfo.branch} mono />
          <Row label={t('about.buildDate')} value={formatBuildDate(buildInfo.buildDate, locale)} />
          <Row
            label={t('about.repository')}
            value={repoLabel()}
            icon="external-link"
            onPress={
              repository ? () => void Linking.openURL(repository).catch(() => undefined) : undefined
            }
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

interface RowProps {
  label: string;
  /** Nullish renders NOTHING - a row with no value is a row with no reason to
   * exist, which is how the git-less build hides its empty half. */
  value: string | null | undefined;
  /** Hashes and branch names are strings to COMPARE, not to read as prose. */
  mono?: boolean;
  icon?: IconName;
  onPress?: () => void;
}

/** One settings line: label left, value right, pressable only when it leads
 * somewhere. */
function Row({ label, value, mono, icon, onPress }: Readonly<RowProps>) {
  if (!value) return null;
  const body: ReactNode = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text numberOfLines={1} style={mono ? styles.rowValueMono : styles.rowValue}>
          {value}
        </Text>
        {icon ? <Icon name={icon} size={16} stroke={2.2} color={colors.textFaint} /> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

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
  rowValueMono: { ...type.caption, flexShrink: 1, fontFamily: MONO },
});
