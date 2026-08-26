import { createContext, useCallback, useContext } from 'react';
import type { I18n, ScopedTranslate } from '../i18n';
import type { Locale, MessageKey, Translate } from '../registry';
import type { Catalog } from '../types';

/** The instance and the locale a provider hands down. `version` changes when a
 *  scope is added or removed: the provider watches the store once, on behalf of
 *  every consumer, rather than each of them opening its own subscription. */
export interface I18nValue {
  i18n: I18n<string, Catalog>;
  locale: Locale;
  version: number;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nValue | null>(null);

function useI18nValue(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useT/useLocale must be used within <I18nProvider>');
  return value;
}

/**
 * A translator for the active locale.
 *
 * Pass a scope to read a runtime-added catalog first, which is how a module
 * reads its own messages while still falling back to the app's. A catalog that
 * arrives after first paint re-renders through the provider, so it does not
 * leave its keys showing.
 */
// Scoped signature FIRST and plain one LAST: overload resolution reads top
// down, so `useT('mod')` still lands on the scoped one, while
// `ReturnType<typeof useT>` reads the LAST signature and so stays `Translate`.
// That idiom is how a helper here declares the translator it is handed, and
// the loose scoped type would not accept a strict one in its place.
export function useT(scope: string): ScopedTranslate<MessageKey>;
export function useT(): Translate;
export function useT(scope?: string): ScopedTranslate<MessageKey> {
  const { i18n, locale } = useI18nValue();
  return i18n.translator(locale, scope as string) as ScopedTranslate<MessageKey>;
}

/** A factory for scoped translators, for a view that renders rows belonging to
 *  several scopes at once and so cannot call {@link useT} once per row. */
export function useScopedT(): (scope: string) => ScopedTranslate<MessageKey> {
  const { i18n, locale, version } = useI18nValue();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is what says the catalogs moved; without it a caller holding this in a dependency list keeps a stale scope.
  return useCallback(
    (scope: string) => i18n.translator(locale, scope) as ScopedTranslate<MessageKey>,
    [i18n, locale, version],
  );
}

export function useLocale(): Locale {
  return useI18nValue().locale;
}

/** A no-op unless the provider was given an `onLocaleChange`. */
export function useSetLocale(): (locale: Locale) => void {
  return useI18nValue().setLocale;
}

/** The instance itself, for the caller that needs `add` when a module loads. */
export function useI18n(): I18n<string, Catalog> {
  return useI18nValue().i18n;
}
