// A config object rather than a `kromaWorkbench()` factory: calling
// `defineWorkbench` here would make @kromatv/ui import @kromatv/workbench, which
// imports @kromatv/ui. Spreading a plain object leaves the only dependency a TYPE,
// and a type import is erased, so at runtime nothing points back.

import type { ProviderSpec } from '@kromatv/workbench';
import type { ReactNode } from 'react';
import { Logo } from '#ui/components/atoms/logo';
import { I18nProvider } from '#ui/services/i18n';

type Locale = 'en' | 'fr';

export const KROMA_WORKBENCH: {
  title: string;
  brand: ReactNode;
  provider: ProviderSpec<Locale>;
} = {
  title: 'Kit',
  brand: <Logo size={19} />,
  // The kit's translated components read strings through `useT()`, which throws
  // outside a provider.
  provider: {
    name: 'Language',
    glyph: 'language',
    values: [
      { value: 'en', label: 'English' },
      { value: 'fr', label: 'Français' },
    ],
    render: (locale, onLocaleChange, children) => (
      <I18nProvider locale={locale} onLocaleChange={onLocaleChange}>
        {children}
      </I18nProvider>
    ),
  },
};
