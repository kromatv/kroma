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
      // The browser TVs (webOS, Tizen) do have an <html> - each shell ships one -
      // and its `lang` is what the set's screen reader consults to decide how to
      // pronounce what it is reading. Shipped hardcoded to `fr`, it made an
      // English UI be read with French phonetics, which is a real finding in
      // Samsung's accessibility review. The shared provider no-ops where there
      // is no document, so the native TVs are unaffected.
      syncHtmlLang
    >
      {children}
    </UiLocaleProvider>
  );
}
