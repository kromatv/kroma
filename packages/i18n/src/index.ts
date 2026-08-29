export { type DefineI18nConfig, defineI18n } from './define';
export {
  type AppLocales,
  activeAppLocales,
  installAppLocales,
  installKeyInspector,
  installLocaleOverride,
  type KeyInspector,
  onOverridesChange,
  type Rendered,
} from './dev-overrides';
export {
  createI18n,
  type I18n,
  type I18nConfig,
  type InferRegister,
  type ScopedTranslate,
} from './i18n';
export { hasToken, interpolate, tokensIn } from './interpolate';
export { createLocales } from './locales';
export { expandRefs, hasUnresolvedRef } from './nest';
export { resolvePluralKey, selectCategory } from './plural';
export type { Locale, MessageKey, Messages, Register, Translate } from './registry';
export { SCHEMA_KEY } from './store';
export type {
  Catalog,
  CatalogSource,
  Catalogs,
  LocaleSet,
  PluralCategory,
  PluralRule,
  TVars,
} from './types';
