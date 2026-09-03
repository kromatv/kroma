// Resolves and persists the active UI locale, then feeds it to <I18nProvider>.
// Shared by the web and TV apps. Precedence:
//   1. the signed-in account's preference (synced across devices), adopted on
//      sign-in / profile switch;
//   2. the device-level override the user last picked (localStorage);
//   3. the browser locale, else the project default (fr).
// A change is persisted to the device AND, when signed in, to the account.
//
// Tolerates a null client (the TV `connect` screen runs before a server is
// reached), so even pre-auth copy is translated.

import { type KromaClient, saveLocalePref } from '@kroma/client';
import { deviceLocale, type Locale, normalizeLocale, setActiveLocale } from '@kroma/core';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { I18nProvider } from './i18n';

export interface LocaleProviderProps {
  /** API client whose Accept-Language is kept in sync. Null before a server is reached. */
  client: KromaClient | null;
  /** The signed-in account's language preference, or null/undefined when signed out. */
  accountLanguage?: string | null;
  /** Persist a manual change to the signed-in account. Omit when signed out. */
  onAccountChange?: (locale: Locale) => void;
  /** Mirror the locale onto `<html lang>`. Every DOM target wants this, the
   * browser TVs included: `lang` is what a set's screen reader reads to decide
   * how to PRONOUNCE the interface. No-ops where there is no document, so a
   * native target may pass it harmlessly. */
  syncHtmlLang?: boolean;
  children: ReactNode;
}

export function LocaleProvider({
  client,
  accountLanguage,
  onAccountChange,
  syncHtmlLang,
  children,
}: Readonly<LocaleProviderProps>) {
  const accountLocale = normalizeLocale(accountLanguage);

  // The right locale from the first render: a catalog is fetched per locale
  // rendered, so starting in the default and switching after hydration would
  // download two languages. On the server there is no navigator or storage, so
  // this resolves to the default there, and the prerendered shell carries no
  // translated markup for the two to disagree on.
  const [override, setOverride] = useState<Locale>(() => accountLocale ?? deviceLocale());

  // The client's Accept-Language moves in the same step as the state, never in a
  // later effect: a consumer's own effect runs before this component's, and would
  // refetch under the old header.
  const applied = useRef<Locale>(override);
  const apply = useCallback(
    (next: Locale) => {
      applied.current = next;
      setOverride(next);
      setActiveLocale(next);
      client?.setLocale(next);
    },
    [client],
  );

  // On mount: hand the device locale to the client's Accept-Language, unless the
  // signed-in account's preference already applies (handled by the effect
  // below). When the user is signed in but has no account-level language set,
  // sync the detected locale to the server so server-rendered content
  // (notifications, push) matches the UI.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only; account changes are handled separately.
  useEffect(() => {
    if (accountLocale) return;
    const detected = deviceLocale();
    apply(detected);
    if (onAccountChange) {
      onAccountChange(detected);
      client?.accounts.updateLanguage(detected).catch(() => {});
    }
  }, []);

  // The signed-in account's preference is authoritative: adopt it whenever it
  // becomes known or changes (sign-in, profile switch, or an `me()` refresh that
  // pulled a change made on another device). A manual switch updates the account
  // too (handleChange), so this never reverts a deliberate choice; runs only when
  // accountLocale changes, so it leaves a signed-out device override alone.
  useEffect(() => {
    if (accountLocale) {
      apply(accountLocale);
      saveLocalePref(accountLocale);
    }
  }, [accountLocale, apply]);

  const locale = override;

  // Catches the client arriving after the locale did (the TV reaches a server
  // late). Reads the ref, never this render's `locale`, which on the commit that
  // adopts a locale is still the previous one.
  useEffect(() => {
    client?.setLocale(applied.current);
  }, [client]);

  useEffect(() => {
    // biome-ignore lint/style/noRestrictedGlobals: audited - guarded; there is no <html lang> to sync on a native target.
    if (syncHtmlLang && typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale, syncHtmlLang]);

  const handleChange = useCallback(
    (next: Locale) => {
      apply(next);
      saveLocalePref(next);
      // Best-effort account sync so the choice follows the profile everywhere.
      if (onAccountChange) {
        onAccountChange(next);
        client?.accounts.updateLanguage(next).catch(() => {});
      }
    },
    [apply, client, onAccountChange],
  );

  return (
    <I18nProvider locale={locale} onLocaleChange={handleChange}>
      {children}
    </I18nProvider>
  );
}
