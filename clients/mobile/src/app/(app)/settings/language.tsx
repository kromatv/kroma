// Interface language: device override, synced to the account like the other
// clients so the choice follows the user everywhere.

import { LOCALES } from '@kromatv/core';
import type { Locale } from '@kromatv/i18n';
import { Box, LanguagePicker, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { PageHeader } from '#mobile/components/page-header.component';
import { Screen } from '#mobile/components/ui';
import { osLanguageTags, useI18n, useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

export default function LanguageSettings() {
  const s = useStyles(sDefinition);

  const t = useT();
  const client = useClient();
  const { setUser } = useSession();
  const { locale, setOverride } = useI18n();
  const [saving, setSaving] = useState(false);
  const [device] = useState(osLanguageTags);

  const pick = async (next: Locale) => {
    if (next === locale || saving) {
      return;
    }
    setOverride(next);
    setSaving(true);
    try {
      const { user: updated } = await client.accounts.updateLanguage(next);
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
      <LanguagePicker.Root
        locales={LOCALES}
        label={t('account.uiLanguage')}
        value={locale}
        onValueChange={(next) => void pick(next)}
        preferred={device}
      >
        <Box style={s.head}>
          <Text style={s.hint}>{t('account.uiLanguageDesc')}</Text>
          <LanguagePicker.Input />
        </Box>
        <ScrollView>
          <Box style={s.body}>
            <LanguagePicker.List />
            <LanguagePicker.Empty />
          </Box>
        </ScrollView>
      </LanguagePicker.Root>
    </Screen>
  );
}

const sDefinition = styles({
  head: { gap: spacing.sm, px: spacing.md, pt: spacing.md, ...boxed(contentWidth.reading) },
  body: { gap: spacing.sm, p: spacing.md, ...boxed(contentWidth.reading) },
  hint: { ...type.caption, px: 4 },
});
