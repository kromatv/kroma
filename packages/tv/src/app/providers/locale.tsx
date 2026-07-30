// TV adapter over the shared <LocaleProvider> (@kroma/ui): the client is passed in
// (null on the `connect` screen, before a server is reached) and wired together
// with the signed-in account's preference.
import type { KromaClient, Locale } from '@kroma/core';
import { LocaleProvider as UiLocaleProvider } from '@kroma/ui';
import type { ReactNode } from 'react';
import { useAuth } from '#tv/app/providers/auth';

export function LocaleProvider({
  client,
  children,
}: Readonly<{ client: KromaClient | null; children: ReactNode }>) {
  const { user, updateUser } = useAuth();
  return (
    <UiLocaleProvider
      client={client}
      accountLanguage={user?.language}
      onAccountChange={user ? (next: Locale) => updateUser({ language: next }) : undefined}
      // Browser TVs (webOS, Tizen) ship an <html> whose `lang` attribute is what
      // the set's screen reader uses to choose pronunciation; a hardcoded value
      // read an English UI with French phonetics. No-ops where there is no
      // document, so native TVs are unaffected.
      syncHtmlLang
    >
      {children}
    </UiLocaleProvider>
  );
}
