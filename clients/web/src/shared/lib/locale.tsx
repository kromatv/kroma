import type { Locale } from '@kromatv/i18n';
import { LocaleProvider as UiLocaleProvider, useLocale } from '@kromatv/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef } from 'react';
import { useAuth } from '#web/shared/lib/auth';

function RefetchOnLocaleChange({ children }: Readonly<{ children: ReactNode }>) {
  const locale = useLocale();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const served = useRef<string | null>(null);
  useEffect(() => {
    // the client's locale is what the requests actually carried: while it disagrees
    // with `locale` the provider is still settling and there is nothing to drop.
    const asked = client.locale;
    if (asked !== locale) return;
    const before = served.current;
    served.current = asked;
    if (before === null || before === asked) return;
    void queryClient.invalidateQueries();
  }, [locale, queryClient, client]);
  return children;
}

export function LocaleProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user, client, updateUser } = useAuth();
  return (
    <UiLocaleProvider
      client={client}
      accountLanguage={user?.language}
      onAccountChange={user ? (next: Locale) => updateUser({ language: next }) : undefined}
      syncHtmlLang
    >
      <RefetchOnLocaleChange>{children}</RefetchOnLocaleChange>
    </UiLocaleProvider>
  );
}
