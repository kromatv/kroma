// Which i18n instance the kit's own chrome translates through.
//
// In this repo that is KROMA's, named here rather than in `i18n.tsx` so the ONE
// import of the app's catalogs sits in a module of its own. The published build
// swaps this file for `i18n-instance.published.ts`, where a consumer installs
// their own: a design system that arrives with someone else's catalogs is
// carrying 95 phrases of theirs and every other phrase they wrote.

import { DEFAULT_LOCALE, i18n } from '@kromatv/core';
import type { I18n, Locale, Messages, Translate } from '@kromatv/i18n';

/** An instance the kit's chrome can translate through, as `createI18n` builds
 *  one. */
export type KitI18n = I18n<Locale, Messages>;

let installed: { i18n: KitI18n; defaultLocale: Locale } | null = null;

/**
 * Give the kit the catalogs its own chrome speaks through. In this repo it
 * already has KROMA's, so this only matters to a host that wants its own; in
 * the published package there is nothing until it is called.
 */
export function setKitI18n(instance: KitI18n, defaultLocale: Locale): void {
  installed = { i18n: instance, defaultLocale };
}

/** The translator a kit component reaches for outside an `<I18nProvider>`. */
export function translatorFor(locale: Locale): Translate {
  return (installed?.i18n ?? i18n).translator(locale) as Translate;
}

/** What `useLocaleDefault()` answers above a provider. */
export function fallbackLocale(): Locale {
  return installed?.defaultLocale ?? DEFAULT_LOCALE;
}

/** The instance an `<I18nProvider>` drives when it is given none. */
export function providerI18n(): KitI18n {
  return installed?.i18n ?? i18n;
}
