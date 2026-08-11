import { createI18n, type Translate as GenericTranslate, type MessageKeyOf } from './i18n-engine';
import { DEFAULT_LOCALE, type Locale } from './i18n-locales';

import en from './locales/en.json';
import fr from './locales/fr.json';

export { interpolate } from './i18n-engine';
export * from './i18n-locales';

const catalogs = { fr, en } satisfies Record<Locale, Readonly<Record<string, string>>>;

export const i18n = createI18n(catalogs, DEFAULT_LOCALE);

export const { translate, translateIn, createTranslator } = i18n;

export type MessageKey = MessageKeyOf<typeof i18n>;
export type Translate = GenericTranslate<MessageKey>;

export type { TVars } from './i18n-engine';
export type Catalogs<L extends string = Locale> = import('./i18n-engine').Catalogs<L>;
