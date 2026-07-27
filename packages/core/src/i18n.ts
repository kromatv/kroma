import {
  createI18n,
  type Translate as GenericTranslate,
  type LocaleOf,
  type MessageKeyOf,
} from './i18n-engine';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const i18n = createI18n({ fr, en }, 'fr');

export const {
  translate,
  translateIn,
  createTranslator,
  detectLocale,
  isLocale,
  normalizeLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALES,
} = i18n;

export type Locale = LocaleOf<typeof i18n>;
export type MessageKey = MessageKeyOf<typeof i18n>;
export type Translate = GenericTranslate<MessageKey>;

export type { TVars } from './i18n-engine';
export type Catalogs<L extends string = Locale> = import('./i18n-engine').Catalogs<L>;
