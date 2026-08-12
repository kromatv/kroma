// Which languages KROMA speaks, with none of what they say: this module never
// touches a catalogue, so a screen that only needs to know the locale (to format
// a number, to pick a flag) does not pay for 200 kB of messages.

import { createLocales } from './i18n-engine';

const LOCALE_NAMES = { fr: 'Français', en: 'English' } as const;

export type Locale = keyof typeof LOCALE_NAMES;

export const {
  detectLocale,
  isLocale,
  normalizeLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALES,
} = createLocales(LOCALE_NAMES, 'fr');
