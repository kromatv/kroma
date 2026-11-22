import { LOCALES, localeLabel } from '@kromatv/core';
import { useLocale, useSetLocale, useT } from '@kromatv/ui';
import { ChoiceList, Field, GuidedFlow, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  type LanguageChoice,
  matchingChoices,
  orderedChoices,
  preferredCodes,
} from '#web/features/setup/language-choices';
import { nativeLanguageName } from '#web/features/setup/native-language-name';

const SEARCH_FROM = 8;

function useChoices(): LanguageChoice[] {
  const t = useT();
  const choices = LOCALES.map((l) => ({
    code: l.code,
    native: nativeLanguageName(l.code),
    label: localeLabel(t, l),
  }));
  const codes = choices.map((choice) => choice.code);
  return orderedChoices(choices, preferredCodes(codes, globalThis.navigator?.languages ?? []));
}

function LanguageList({ choices }: Readonly<{ choices: readonly LanguageChoice[] }>) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const choose = (code: string) => {
    const chosen = LOCALES.find((candidate) => candidate.code === code);
    if (chosen) {
      setLocale(chosen.code);
    }
  };
  return (
    <ChoiceList.Root size="md" label={t('setup.languageSub')} value={locale} onValueChange={choose}>
      {choices.map((choice) => (
        <ChoiceList.Item key={choice.code} value={choice.code}>
          <ChoiceList.Label>{choice.native}</ChoiceList.Label>
          {choice.label === choice.native ? null : (
            <ChoiceList.Hint>{choice.label}</ChoiceList.Hint>
          )}
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

function LanguageSearch({
  typed,
  onType,
}: Readonly<{ typed: string; onType: (typed: string) => void }>) {
  const t = useT();
  return (
    <Field.Root size="md" label={t('setup.languageSearch')} hideLabel>
      <Field.Input
        icon="search"
        placeholder={t('setup.languageSearch')}
        value={typed}
        onValueChange={onType}
      />
    </Field.Root>
  );
}

/** The first screen: the language the setup, and then KROMA, speaks. It opens
 * on the language the browser asks for, and choosing another changes the
 * screen at once. A long list scrolls and can be searched. */
export function LanguageStep({ onContinue }: Readonly<{ onContinue: () => void }>) {
  const t = useT();
  const choices = useChoices();
  const [typed, setTyped] = useState('');
  const shown = matchingChoices(choices, typed);
  return (
    <>
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.languageTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.languageSub')}</GuidedFlow.Subtitle>

        {choices.length > SEARCH_FROM ? <LanguageSearch typed={typed} onType={setTyped} /> : null}
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <LanguageList choices={shown} />
        {shown.length === 0 ? <Text color="textMuted">{t('setup.languageNone')}</Text> : null}
      </GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Actions>
          <GuidedFlow.Next onPress={onContinue} />
        </GuidedFlow.Actions>
      </GuidedFlow.Footer>
    </>
  );
}
