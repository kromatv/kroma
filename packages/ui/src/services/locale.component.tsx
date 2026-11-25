import { useDeviceStore } from '#ui/lib/device-store';
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

import { type KromaClient, saveLocalePref } from '@kromatv/client';
import { deviceLocale, normalizeLocale } from '@kromatv/core';
import type { Locale } from '@kromatv/i18n';
import { type ReactNode, useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { setDocumentLanguage } from '#ui/lib/dom';
import { I18nProvider } from './i18n';

export interface LocaleProviderProps {
  /** API client whose Accept-Language is kept in sync. Null before a server is reached. */
  client: KromaClient | null;
  /** The signed-in account's language preference, or null/undefined when signed out. */
  accountLanguage?: string | null;
  /** Persist a manual change to the signed-in account. Omit when signed out. */
  onAccountChange?: (locale: Locale) => void;
  /** Mirror the locale onto `<html lang>` and its direction onto `<html dir>`.
   * Every DOM target wants it, the browser TVs included: a set's screen reader
   * reads `lang` to pick a pronunciation. No-ops where there is no document. */
  syncDocumentLanguage?: boolean;
  children: ReactNode;
}

function useDocumentLanguage(
  locale: Locale,
  { syncDocumentLanguage }: Pick<LocaleProviderProps, 'syncDocumentLanguage'>,
): (next: Locale) => void {
  const mirror = useCallback(
    (next: Locale) => {
      if (syncDocumentLanguage) {
        setDocumentLanguage(next);
      }
    },
    [syncDocumentLanguage],
  );
  useEffect(() => {
    mirror(locale);
  }, [locale, mirror]);
  return mirror;
}

export function LocaleProvider({
  client,
  accountLanguage,
  onAccountChange,
  syncDocumentLanguage,
  children,
}: Readonly<LocaleProviderProps>) {
  const storage = useDeviceStore();
  const accountLocale = normalizeLocale(accountLanguage);

  // The right locale from the first render: a catalog is fetched per locale
  // rendered, so starting in the default and switching after hydration would
  // download two languages. On the server there is no navigator or storage, so
  // this resolves to the default there, and the prerendered shell carries no
  // translated markup for the two to disagree on.
  const [override, setOverride] = useState<Locale>(() => accountLocale ?? deviceLocale(storage));
  const mirror = useDocumentLanguage(override, { syncDocumentLanguage });

  // The client's Accept-Language moves in the same step as the state, never in a
  // later effect: a consumer's own effect runs before this component's, and would
  // refetch under the old header.
  const applied = useRef<Locale>(override);
  const apply = useCallback(
    (next: Locale) => {
      applied.current = next;
      setOverride(next);
      client?.setLocale(next);
      mirror(next);
    },
    [client, mirror],
  );

  // On mount: hand the device locale to the client's Accept-Language, unless the
  // signed-in account's preference already applies (handled by the effect
  // below).
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount-only; account changes are handled separately.
  useEffect(() => {
    if (accountLocale) {
      return;
    }
    const detected = deviceLocale(storage);
    applied.current = detected;
    client?.setLocale(detected);
  }, []);

  // A signed-in account with no language of its own takes the device's, so
  // server-rendered content (notifications, push) matches the UI. Keyed on the
  // sign-in rather than on mount: auth usually resolves after the first render.
  const saveToAccount = useEffectEvent(() => {
    onAccountChange?.(applied.current);
    client?.accounts.updateLanguage(applied.current).catch(() => {});
  });
  const signedInWithoutLanguage = onAccountChange !== undefined && !accountLocale;
  useEffect(() => {
    if (signedInWithoutLanguage) {
      saveToAccount();
    }
  }, [signedInWithoutLanguage]);

  // The signed-in account's preference is authoritative: adopt it whenever it
  // becomes known or changes (sign-in, profile switch, or an `me()` refresh that
  // pulled a change made on another device). A manual switch updates the account
  // too (handleChange), so this never reverts a deliberate choice; runs only when
  // accountLocale changes, so it leaves a signed-out device override alone.
  useEffect(() => {
    if (accountLocale) {
      // oxlint-disable-next-line react-compiler/set-state-in-effect -- the header moves in this same step; a render-time adopt would let children's effects refetch under the old Accept-Language.
      apply(accountLocale);
      saveLocalePref(accountLocale, storage);
    }
  }, [accountLocale, apply, storage]);

  const locale = override;

  // Catches the client arriving after the locale did (the TV reaches a server
  // late). Reads the ref, never this render's `locale`, which on the commit that
  // adopts a locale is still the previous one.
  useEffect(() => {
    client?.setLocale(applied.current);
  }, [client]);

  const handleChange = useCallback(
    (next: Locale) => {
      apply(next);
      saveLocalePref(next, storage);
      // Best-effort account sync so the choice follows the profile everywhere.
      if (onAccountChange) {
        onAccountChange(next);
        client?.accounts.updateLanguage(next).catch(() => {});
      }
    },
    [apply, client, onAccountChange, storage],
  );

  return (
    <I18nProvider locale={locale} onLocaleChange={handleChange}>
      {children}
    </I18nProvider>
  );
}
