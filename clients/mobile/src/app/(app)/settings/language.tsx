// Interface language: device override, synced to the account like the other
// clients so the choice follows the user everywhere.

import { LOCALES, type Locale } from '@kroma/core';
import { Icon, styles } from '@kroma/ui/kit';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { useI18n, useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

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
      <View style={s.body}>
        <Text style={s.hint}>{t('account.uiLanguageDesc')}</Text>
        <View style={s.card}>
          {LOCALES.map((l) => (
            <Pressable
              key={l.code}
              onPress={() => void pick(l.code)}
              style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            >
              <Text style={[s.rowLabel, locale === l.code && { fontWeight: '700' }]}>
                {t(l.labelKey)}
              </Text>
              {locale === l.code ? (
                <Icon name="check" size={17} stroke={2.4} color={colors.accent} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const s = styles({
  body: { gap: spacing.sm, p: spacing.md, ...boxed(contentWidth.reading) },
  hint: { ...type.caption, px: 4, mb: spacing.xs },
  card: { px: 6, py: 4, bg: 'surface1', radius: radius.lg },
  row: { row: true, between: true, align: 'center', minH: 52, px: spacing.sm, radius: radius.md },
  rowPressed: { bg: 'surface2' },
  rowLabel: { ...type.body },
});
