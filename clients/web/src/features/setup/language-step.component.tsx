import { LOCALES } from '@kromatv/core';
import { useLocale, useSetLocale, useT } from '@kromatv/ui';
import { GuidedFlow, LanguagePicker } from '@kromatv/ui/kit';

/** The first screen: the language the setup, and then KROMA, speaks. It opens
 * on the language the browser asks for, and choosing another changes the
 * screen at once. A long list leads with the browser's languages and can be
 * searched. */
export function LanguageStep({ onContinue }: Readonly<{ onContinue: () => void }>) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  return (
    <LanguagePicker.Root
      locales={LOCALES}
      label={t('setup.languageSub')}
      value={locale}
      onValueChange={setLocale}
      size="md"
    >
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.languageTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.languageSub')}</GuidedFlow.Subtitle>
        <LanguagePicker.Input />
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <LanguagePicker.List />
        <LanguagePicker.Empty />
      </GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Actions>
          <GuidedFlow.Next onPress={onContinue} />
        </GuidedFlow.Actions>
      </GuidedFlow.Footer>
    </LanguagePicker.Root>
  );
}
