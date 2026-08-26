// The kit's binding of @kroma/i18n's React layer to KROMA's own instance. The
// provider is controlled: the app owns the resolved `locale`, and useSetLocale()
// bubbles a change request back through `onLocaleChange`.
//
// The standing-alone variants below cannot come from the engine, which has no
// ambient instance by design; they are what lets a kit component translate its
// own chrome without making the provider a mount requirement.

import { DEFAULT_LOCALE, i18n, type Locale, type Translate } from '@kroma/core';
import { I18nContext, I18nProvider as Provider } from '@kroma/i18n/react';
import { type ReactNode, useContext } from 'react';

export { useI18n, useLocale, useScopedT, useSetLocale, useT } from '@kroma/i18n/react';

export interface I18nProviderProps {
  locale: Locale;
  onLocaleChange?: (locale: Locale) => void;
  children: ReactNode;
}

export function I18nProvider({ locale, onLocaleChange, children }: Readonly<I18nProviderProps>) {
  return (
    <Provider i18n={i18n} locale={locale} onLocaleChange={onLocaleChange}>
      {children}
    </Provider>
  );
}

/** Like `useLocale`, but standing alone: outside an <I18nProvider> it is the
 * default locale rather than a throw. What a kit component formatting a number
 * reaches for, and the reason knowing the locale must not drag the catalogs in. */
export function useLocaleDefault(): Locale {
  return (useContext(I18nContext)?.locale as Locale) ?? DEFAULT_LOCALE;
}

/** Like `useT`, but standing alone: outside an <I18nProvider> it speaks the
 * default locale instead of throwing. For the kit's own chrome (an overlay
 * backdrop's accessible name), which must not make the provider a mount
 * requirement for every consumer of a dialog. */
export function useTDefault(): Translate {
  const ctx = useContext(I18nContext);
  return i18n.translator((ctx?.locale as Locale) ?? DEFAULT_LOCALE) as Translate;
}
