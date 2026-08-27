import { type ReactNode, useMemo, useSyncExternalStore } from 'react';
import { activeLocaleOverride, onOverridesChange, overridesRevision } from '../dev-overrides';
import type { I18n } from '../i18n';
import type { Locale } from '../registry';
import type { Catalog } from '../types';
import { I18nContext, type I18nValue } from './context';

const revisionOnServer = () => 0;
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
  const revision = useSyncExternalStore(onOverridesChange, overridesRevision, revisionOnServer);
  const override = useSyncExternalStore(
    onOverridesChange,
    activeLocaleOverride,
    localeOverrideOnServer,
  );
  const active = (override as Locale | null) ?? locale;
  const value = useMemo<I18nValue>(
    () => ({ i18n, locale: active, version, setLocale: (next) => onLocaleChange?.(next) }),
    [i18n, active, version, onLocaleChange],
  );
  // React Compiler memoisation is per mount, so a component that already
  // resolved a string would keep showing it without a remount.
  return (
    <I18nContext.Provider key={revision} value={value}>
      {children}
    </I18nContext.Provider>
  );
}
