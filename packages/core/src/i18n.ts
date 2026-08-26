// KROMA's whole i18n configuration: which languages the product speaks, what
// they say, and the instance every client and the workbench translate through.
// Each catalog names its own language under `lang.<code>`, so the set of
// locales is read from the catalogs rather than written down twice.

import { defineI18n, type InferRegister } from '@kroma/i18n';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const {
  i18n,
  translate,
  translator: createTranslator,
  addCatalogs,
  detectLocale,
  isLocale,
  normalizeLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALES,
} = defineI18n({ catalogs: { fr, en }, defaultLocale: 'fr' });

/** Taught to @kroma/i18n once, so `Locale`, `MessageKey` and `Translate` are
 *  KROMA's own wherever they are imported and no call site carries a generic. */
declare module '@kroma/i18n' {
  interface Register extends InferRegister<typeof i18n> {}
}

export type { Catalogs, Locale, MessageKey, Translate, TVars } from '@kroma/i18n';
