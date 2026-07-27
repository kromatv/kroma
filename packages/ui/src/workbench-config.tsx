// Everything KROMA-shaped about a workbench, in one place.
//
// `defineWorkbench` removed the provider plumbing from the hosts that mount one
// - the kit site and app, the two TV shells, the phone - but the PAYLOAD was
// still copied into all of them verbatim: the same title, the same mark at the
// same size, the same two-locale provider block. Adding a locale, resizing the
// logo or adding a second required provider was a five-file edit with nothing to
// catch a miss, and the TV pair are meant to be exact mirrors of each other.
//
// So the split is: `defineWorkbench` knows how to be a workbench and nothing
// about KROMA; this knows KROMA and nothing about bundlers. What is genuinely
// per-host stays the host's - the registry, because a glob resolves relative to
// the file that writes it, and the router, because a filesystem-served TV shell,
// a static site and a screen inside Expo Router want three different answers.
//
// WHY THIS IS A CONFIG OBJECT rather than a `kromaWorkbench()` factory: calling
// `defineWorkbench` here would make @kroma/ui import @kroma/workbench, which
// imports @kroma/ui - a cycle in the design system's own manifest, and one that
// forces an arbitrary order on anything that topologically sorts the workspace.
// Spreading a plain object instead leaves the only dependency a TYPE, and a type
// import is erased, so at runtime nothing points back. The host does the call,
// which it was doing anyway.

import type { ProviderSpec } from '@kroma/workbench';
import type { ReactNode } from 'react';
import { Logo } from '#ui/components/atoms/logo';
import { I18nProvider } from '#ui/services/i18n';

/** The locales the toolbar's language lens offers. */
type Locale = 'en' | 'fr';

/** The KROMA half of a workbench definition. Spread it into `defineWorkbench`
 * alongside the two things only the host knows:
 *
 *   export const Kit = defineWorkbench({ ...KROMA_WORKBENCH, stories: STORIES });
 */
export const KROMA_WORKBENCH: {
  title: string;
  brand: ReactNode;
  provider: ProviderSpec<Locale>;
} = {
  title: 'Kit',
  brand: <Logo size={19} />,
  // The kit's translated components read strings through `useT()`, which THROWS
  // outside a provider - which is why the whole player family had no stories
  // until one was mounted around them. Declaring it here also puts it on the
  // toolbar, so the design can be read in French, where the words are longer and
  // layouts break first.
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
