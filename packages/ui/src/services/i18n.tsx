// React bindings for the shared i18n core. The provider is controlled: the app
// owns the resolved `locale`, and useSetLocale() bubbles a change request back
// through `onLocaleChange`. Everything here binds the message catalogs; the
// locale-only half is ./i18n-context, re-exported below so this stays the one
// import path.

import { createTranslator, DEFAULT_LOCALE, type Locale, type Translate } from '@kroma/core';
import { type ReactNode, useContext, useMemo } from 'react';
import { I18nContext, type I18nValue } from './i18n-context';

export { useLocale, useLocaleDefault, useSetLocale, useT } from './i18n-context';

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

// Built once, on first use: the fallback is a constant of the default locale.
let fallback: Translate | undefined;

function defaultTranslator(): Translate {
  fallback ??= createTranslator(DEFAULT_LOCALE);
  return fallback;
}

/** Like `useT`, but standing alone: outside an <I18nProvider> it speaks
 * the default locale instead of throwing. For the kit's own chrome (an overlay
 * backdrop's accessible name), which must not make the provider a mount
 * requirement for every consumer of a dialog. */
export function useTDefault(): Translate {
  const ctx = useContext(I18nContext);
  return ctx ? ctx.t : defaultTranslator();
}
