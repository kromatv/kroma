// App settings: appearance, interface language (dedicated page), server
// identity, and what build of the app this actually is.

import { formatBuildDate, LOCALES } from '@kroma/core';
import { Box, Icon, type IconName, styles, Text, ThemeSwitch } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { buildInfo, commitLabel, repoLabel } from '#mobile/lib/buildInfo';
import { useI18n, useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

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
      <ScrollView contentContainerStyle={s.body}>
        <Box style={s.card}>
          <Box style={s.row}>
            <Text style={s.rowLabel}>{t('appearance.title')}</Text>
            <ThemeSwitch
              label={t('appearance.title')}
              labels={{
                system: t('appearance.system'),
                light: t('appearance.light'),
                dark: t('appearance.dark'),
              }}
            />
          </Box>
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
        </Box>

        <Text style={s.group}>{t('nav.server')}</Text>
        <Box style={s.card}>
          <Row label={t('nav.server')} value={serverUrl?.replace(/^https?:\/\//, '')} />
          {/* Plain "Version": the group heading above already says which side. */}
          <Row label={t('about.version')} value={health.data ? `v${health.data.version}` : '…'} />
        </Box>

        <Text style={s.group}>{t('about.title')}</Text>
        <Box style={s.card}>
          <Row label={t('about.version')} value={`v${buildInfo.version}`} />
          {/* Git-derived fields are absent in a build made outside a checkout
              (a source tarball); each row hides itself when its value is empty. */}
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
        </Box>
      </ScrollView>
    </Screen>
  );
}

interface RowProps {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  icon?: IconName;
  onPress?: () => void;
}

function Row({ label, value, mono, icon, onPress }: Readonly<RowProps>) {
  // A row with no value renders nothing, which is how a git-less build hides
  // its own empty rows.
  if (!value) return null;
  const body: ReactNode = (
    <>
      <Text style={s.rowLabel}>{label}</Text>
      <Box style={s.rowRight}>
        <Text lines={1} style={mono ? s.rowValueMono : s.rowValue}>
          {value}
        </Text>
        {icon ? <Icon name={icon} size={16} thickness={2.2} color="textDim" /> : null}
      </Box>
    </>
  );
  if (!onPress) return <Box style={s.row}>{body}</Box>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      {body}
    </Pressable>
  );
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const s = styles({
  body: { gap: spacing.sm, p: spacing.md, ...boxed(contentWidth.reading) },
  group: {
    ...type.small,
    px: 4,
    mt: spacing.md,
    mb: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: { px: 6, py: 4, bg: 'surface1', radius: radius.lg },
  row: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.md,
    minH: 52,
    px: spacing.sm,
    radius: radius.md,
  },
  rowPressed: { bg: 'surface2' },
  rowLabel: { ...type.body, fontWeight: '500' },
  rowRight: { row: true, align: 'center', shrink: 1, gap: 8 },
  rowValue: { ...type.caption, shrink: 1 },
  rowValueMono: { ...type.caption, shrink: 1, fontFamily: MONO },
});
