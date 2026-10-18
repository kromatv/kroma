// Which i18n instance the kit's own chrome translates through.
//
// In this repo that is KROMA's, named here rather than in `i18n.tsx` so the ONE
// import of the app's catalogs sits in a module of its own. The published build
// swaps this file for `i18n-instance.published.ts`, where a consumer supplies
// their own to a provider: a design system that arrives with someone else's catalogs is
// carrying 95 phrases of theirs and every other phrase they wrote.

import { DEFAULT_LOCALE, i18n } from '@kromatv/core';
import type { I18n, Locale, Messages, Translate } from '@kromatv/i18n';

/** An instance the kit's chrome can translate through, as `createI18n` builds
 *  one. */
export type KitI18n = I18n<Locale, Messages>;

/** The standalone translator uses this repo's catalogs unless an instance is supplied. */
export function translatorFor(locale: Locale, instance: KitI18n = i18n): Translate {
  return instance.translator(locale) as Translate;
}

export function fallbackLocale(): Locale {
  return DEFAULT_LOCALE;
}

export function providerI18n(): KitI18n {
  return i18n;
}
