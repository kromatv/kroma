// The published kit's standalone fallback: echo keys until a host supplies
// an instance to its I18nProvider.
//
// This file replaces `i18n-instance.ts` in the staged package. Without a
// provider every key renders as itself, which is a legible placeholder.

import type { I18n, Locale, Messages, Translate } from '@kromatv/i18n';

/** An instance the kit's chrome can translate through, as `createI18n` builds
 *  one. `createI18n` is re-exported from this package, so a consumer needs no
 *  other install to make one. */
export type KitI18n = I18n<Locale, Messages>;

const echo = ((key: string) => key) as Translate;

export function translatorFor(locale: Locale, instance?: KitI18n): Translate {
  return (instance?.translator(locale) as Translate | undefined) ?? echo;
}

export function fallbackLocale(): Locale {
  return 'en' as Locale;
}

export function providerI18n(): KitI18n | undefined {
  return undefined;
}
