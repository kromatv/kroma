import { type ReactNode, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { activeLocaleOverride, installAppLocales, onOverridesChange } from '../dev-overrides';
import type { I18n } from '../i18n';
import type { Locale } from '../registry';
import type { Catalog } from '../types';
import { I18nContext, type I18nValue } from './context';

const localeOverrideOnServer = () => null;

export interface I18nProviderProps {
  /** The instance built by `createI18n`. */
  i18n: I18n<string, Catalog>;
  /** Controlled: the app owns the resolved locale and `useSetLocale` asks for a
   *  change through `onLocaleChange` rather than setting it here. */
  locale: Locale;
  onLocaleChange?: (locale: Locale) => void;
  children: ReactNode;
}

export function I18nProvider({
  i18n,
  locale,
  onLocaleChange,
  children,
}: Readonly<I18nProviderProps>) {
  // One subscription for the whole tree. `useT` is called from hundreds of
  // components, and a store watch in each of them would mean a set insert per
  // mount for something that changes only when a module registers a catalog.
  const version = useSyncExternalStore(i18n.subscribe, i18n.version, i18n.version);
  const override = useSyncExternalStore(
    onOverridesChange,
    activeLocaleOverride,
    localeOverrideOnServer,
  );
  const active = (override as Locale | null) ?? locale;
  // During render, not in an effect: the children render right after this and
  // suspend on what is in flight, so the fetches have to be started first.
  i18n.warm(active);
  // A shell that passes an inline handler would otherwise rebuild the
  // translator on every render of this provider, and a caller holding it in a
  // dependency list would re-run with it.
  const change = useRef(onLocaleChange);
  change.current = onLocaleChange;
  // The dev tools reach an engine they were never handed, so the engine says
  // what it can render rather than being read out of the app's own table.
  useEffect(() => {
    installAppLocales({ codes: i18n.locales(), resolved: locale });
  }, [i18n, locale]);
  const value = useMemo<I18nValue>(
    () => ({
      i18n,
      locale: active,
      version,
      translator: (scope) => i18n.translator(active, scope as string) as never,
      setLocale: (next) => change.current?.(next),
    }),
    [i18n, active, version],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
