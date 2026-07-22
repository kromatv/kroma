// Interface language: device override, synced to the account like the other
// clients so the choice follows the user everywhere.

import { LOCALES, type Locale } from '@kroma/core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { useI18n, useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';
import { CheckIcon } from '#mobile/player/icons';

export default function LanguageSettings() {
  const t = useT();
  const client = useClient();
  const { setUser } = useSession();
  const { locale, setOverride } = useI18n();
  const [saving, setSaving] = useState(false);

  const pick = async (next: Locale) => {
    if (next === locale || saving) return;
    setOverride(next);
    setSaving(true);
    try {
      const { user: updated } = await client.updateLanguage(next);
      setUser(updated);
    } catch {
      // Device override still applies; the account sync is best-effort.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded={false}>
      <PageHeader title={t('account.uiLanguage')} />
      <View style={styles.body}>
        <Text style={styles.hint}>{t('account.uiLanguageDesc')}</Text>
        <View style={styles.card}>
          {LOCALES.map((l) => (
            <Pressable
              key={l.code}
              onPress={() => void pick(l.code)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={[styles.rowLabel, locale === l.code && { fontWeight: '700' }]}>
                {t(l.labelKey)}
              </Text>
              {locale === l.code ? <CheckIcon size={17} color={colors.accent} /> : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, gap: spacing.sm, ...boxed(contentWidth.reading) },
  hint: { ...type.caption, paddingHorizontal: 4, marginBottom: spacing.xs },
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
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowLabel: { ...type.body },
});
