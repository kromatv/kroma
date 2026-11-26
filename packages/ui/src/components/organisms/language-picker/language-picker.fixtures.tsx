import { LOCALES } from '@kromatv/core';
import { createLocales, type OfferedLocale } from '@kromatv/i18n';
import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import type { ControlSize } from '#ui/lib/field-shell';
import { LanguagePicker } from './language-picker.component';

export const WORLD: readonly OfferedLocale<string>[] = createLocales(
  {
    fr: 'Français',
    en: 'English',
    ko: '한국어',
    de: 'Deutsch',
    es: 'Español',
    ja: '日本語',
    pt: 'Português',
    vi: 'Tiếng Việt',
    'zh-Hans': '简体中文',
    'fr-CA': 'Français (Canada)',
    it: 'Italiano',
    nl: 'Nederlands',
    pl: 'Polski',
    sv: 'Svenska',
    tr: 'Türkçe',
    uk: 'Українська',
    ar: 'العربية',
    he: 'עברית',
    hi: 'हिन्दी',
    th: 'ไทย',
  },
  'fr',
  ['de', 'es', 'ja', 'pt', 'vi', 'zh-Hans'],
).LOCALES;

export const SHORT: readonly OfferedLocale<string>[] = createLocales(
  { fr: 'Français', en: 'English', ko: '한국어' },
  'fr',
  ['ko'],
).LOCALES;

export const DEVICE = ['ja-JP', 'en-US'];

export interface PickerArgs {
  size?: ControlSize;
}

export function Settings({ size }: Readonly<PickerArgs>) {
  const [locale, setLocale] = useState('fr');
  return (
    <LanguagePicker.Root
      locales={WORLD}
      label="Interface language"
      value={locale}
      onValueChange={setLocale}
      preferred={DEVICE}
      size={size}
    >
      <LanguagePicker.Trigger />
    </LanguagePicker.Root>
  );
}

export function Offered({ size }: Readonly<PickerArgs>) {
  const [locale, setLocale] = useState('en');
  return (
    <LanguagePicker.Root
      locales={LOCALES}
      label="Interface language"
      value={locale}
      onValueChange={setLocale}
      size={size}
    >
      <LanguagePicker.Trigger />
    </LanguagePicker.Root>
  );
}

export function InPlace() {
  const [locale, setLocale] = useState('fr');
  return (
    <LanguagePicker.Root
      locales={WORLD}
      label="Interface language"
      value={locale}
      onValueChange={setLocale}
      preferred={DEVICE}
    >
      <Box gap={12}>
        <LanguagePicker.Input />
        <LanguagePicker.List />
        <LanguagePicker.Empty />
      </Box>
    </LanguagePicker.Root>
  );
}
