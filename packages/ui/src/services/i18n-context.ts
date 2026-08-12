// The locale half of the i18n bindings: everything a consumer can read without
// a message catalogue coming with it. The provider that fills this context, and
// the hooks that translate standing alone, live in ./i18n.

import { DEFAULT_LOCALE, type Locale, type Translate } from '@kroma/core';
import { createContext, useContext } from 'react';

export interface I18nValue {
  locale: Locale;
  t: Translate;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nValue | null>(null);

function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT/useLocale must be used within <I18nProvider>');
  return ctx;
}

export function useT(): Translate {
  return useI18n().t;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

/** Like {@link useLocale}, but standing alone: outside an <I18nProvider> it is
 * the default locale rather than a throw. What a kit component formatting a
 * number reaches for, and the reason knowing the locale must not drag the
 * catalogs in. */
export function useLocaleDefault(): Locale {
  return useContext(I18nContext)?.locale ?? DEFAULT_LOCALE;
}

/** A no-op unless the provider was given an `onLocaleChange`. */
export function useSetLocale(): (locale: Locale) => void {
  return useI18n().setLocale;
}
