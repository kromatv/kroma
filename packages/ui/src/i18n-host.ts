// What a host outside this repo needs to give the kit its words.
//
// A build entry for the PUBLISHED package only: in this repo the kit already
// speaks KROMA's catalogs, and re-exporting `@kromatv/i18n` here would be a
// second door onto a package that already has one.

export type { Catalogs, I18n, I18nConfig, Locale, Messages, Translate, TVars } from '@kromatv/i18n';
export { createI18n } from '@kromatv/i18n';
export type { I18nProviderProps } from './services/i18n';
export {
  I18nProvider,
  useI18n,
  useLocale,
  useLocaleDefault,
  useSetLocale,
  useT,
  useTDefault,
} from './services/i18n';
export type { KitI18n } from './services/i18n-instance';
export { setKitI18n } from './services/i18n-instance';
