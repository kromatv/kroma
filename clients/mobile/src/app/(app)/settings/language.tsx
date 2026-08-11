// Interface language: device override, synced to the account like the other
// clients so the choice follows the user everywhere.

import type { Locale } from '@kroma/core';
import { Box, styles, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import { LocalePicker } from '#mobile/components/LocalePicker';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { useI18n, useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { useClient, useSession } from '#mobile/lib/session';
import { spacing, type } from '#mobile/lib/theme';

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
      <Box style={s.body}>
        <Text style={s.hint}>{t('account.uiLanguageDesc')}</Text>
        <LocalePicker locale={locale} onPick={(next) => void pick(next)} />
      </Box>
    </Screen>
  );
}

const s = styles({
  body: { gap: spacing.sm, p: spacing.md, ...boxed(contentWidth.reading) },
  hint: { ...type.caption, px: 4, mb: spacing.xs },
});
