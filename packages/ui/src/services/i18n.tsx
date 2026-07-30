// React bindings for the shared i18n core. The provider is controlled: the app
// owns the resolved `locale`, and useSetLocale() bubbles a change request back
// through `onLocaleChange`.

import { createTranslator, type Locale, type Translate } from '@kroma/core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

interface I18nValue {
  locale: Locale;
  t: Translate;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export interface I18nProviderProps {
  locale: Locale;
  onLocaleChange?: (locale: Locale) => void;
  children: ReactNode;
}

export function I18nProvider({ locale, onLocaleChange, children }: Readonly<I18nProviderProps>) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: createTranslator(locale),
      setLocale: (next) => onLocaleChange?.(next),
    }),
    [locale, onLocaleChange],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

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

/** A no-op unless the provider was given an `onLocaleChange`. */
export function useSetLocale(): (locale: Locale) => void {
  return useI18n().setLocale;
}
