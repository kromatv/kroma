// React bindings for the shared @kromatv/core i18n catalogs. Locale precedence:
// the language picked on this device, in the app or in the system's settings
// for it, then the system's language for the app, then the account preference.

import { createTranslator, DEFAULT_LOCALE, normalizeLocale } from '@kromatv/core';
import type { Locale, Translate } from '@kromatv/i18n';
import { getLocales } from 'expo-localization';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import { useLanguageChoice } from './language-choice.hook';
import { useSession } from './session';

interface I18n {
  locale: Locale;
  t: Translate;
  system: Locale | null;
  choose: (locale: Locale) => void;
}

const Ctx = createContext<I18n | null>(null);

export function useT(): Translate {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('useT outside I18nProvider');
  }
  return value.t;
}

export function useI18n(): I18n {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('useI18n outside I18nProvider');
  }
  return value;
}

/** The languages the phone asks for, most wanted first, as BCP 47 tags. */
export function osLanguageTags(): string[] {
  return getLocales().map((l) => l.languageTag);
}

function useAccountSync(): (locale: Locale) => void {
  const { user, client, setUser } = useSession();
  return useCallback(
    (next: Locale) => {
      if (!client || !user) {
        return;
      }
      void client.accounts
        .updateLanguage(next)
        .then(({ user: updated }) => setUser(updated))
        .catch(() => undefined);
    },
    [client, user, setUser],
  );
}

export function I18nProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { status, user, client, setRequestLocale } = useSession();
  const onChoose = useAccountSync();
  const { chosen, system, choose } = useLanguageChoice({ ready: status !== 'booting', onChoose });

  const locale = chosen ?? system ?? normalizeLocale(user?.language) ?? DEFAULT_LOCALE;

  // Publish request language to the session root and its current client.
  useEffect(() => {
    setRequestLocale(locale);
    client?.setLocale(locale);
  }, [client, locale, setRequestLocale]);

  const value = useMemo<I18n>(
    () => ({ locale, t: createTranslator(locale), system, choose }),
    [locale, system, choose],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
