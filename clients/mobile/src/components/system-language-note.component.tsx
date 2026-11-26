import { LOCALES } from '@kromatv/core';
import { Button, Callout } from '@kromatv/ui/kit';
import { Linking } from 'react-native';
import { useI18n, useT } from '#mobile/lib/i18n';
import { languageToChangeInSettings } from '#mobile/lib/language-sync';
import { systemLanguageReach } from '../../modules/app-language';

/** Names the language the device's settings still hold for the app when only
 *  the user can change it there, with the way to them. Nothing when the two
 *  agree. */
export function SystemLanguageNote() {
  const t = useT();
  const { locale, system } = useI18n();
  const held = languageToChangeInSettings(systemLanguageReach, { system, locale });
  const language = LOCALES.find((offered) => offered.code === held)?.name;
  if (!language) {
    return null;
  }
  return (
    <Callout.Root tone="neutral" size="sm" icon="settings">
      <Callout.Title>{t('account.uiLanguageInSettings', { language })}</Callout.Title>
      <Callout.Detail>{t('account.uiLanguageInSettingsHint')}</Callout.Detail>
      <Callout.Actions>
        <Button
          variant="glass"
          size="sm"
          label={t('account.uiLanguageOpenSettings')}
          onPress={() => void Linking.openSettings().catch(() => undefined)}
        />
      </Callout.Actions>
    </Callout.Root>
  );
}
