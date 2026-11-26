// Interface language: picked for this device, synced to the account like the
// other clients so the choice follows the user everywhere.

import { LOCALES } from '@kromatv/core';
import { Box, LanguagePicker, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { PageHeader } from '#mobile/components/page-header.component';
import { SystemLanguageNote } from '#mobile/components/system-language-note.component';
import { Screen } from '#mobile/components/ui';
import { osLanguageTags, useI18n, useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { spacing, type } from '#mobile/lib/theme';

export default function LanguageSettings() {
  const s = useStyles(sDefinition);

  const t = useT();
  const { locale, choose } = useI18n();
  const [device] = useState(osLanguageTags);

  return (
    <Screen padded={false}>
      <PageHeader title={t('account.uiLanguage')} />
      <LanguagePicker.Root
        locales={LOCALES}
        label={t('account.uiLanguage')}
        value={locale}
        onValueChange={choose}
        preferred={device}
      >
        <Box style={s.head}>
          <Text style={s.hint}>{t('account.uiLanguageDesc')}</Text>
          <SystemLanguageNote />
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
